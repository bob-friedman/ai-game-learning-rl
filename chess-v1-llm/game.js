function engineGame(options) {
    options = options || {}
    var game = new Chess();
    var board;
    var engine = STOCKFISH();
    var onBestMoveCallback = null;
    var displayScore = false;
    var time = {};
    var playerColor = 'white';
    var isEngineRunning = false;
    var llmConfig  = null;
    var llmMoveLog = [];
    var llmRetryCount  = 0;
    var llmIsPaused    = false;
    var llmPausedFen   = null;
    var engineStatus = {
        engineLoaded: false,
        engineReady:  false,
        search:       null,
        score:        null,
        pv:           null
    };
    function buildMoveHistory() {
        var history = game.history({ verbose: true });
        var result  = [];
        var commentByMove = {};
        for (var k = 0; k < llmMoveLog.length; k++) {
            if (llmMoveLog[k].comment) {
                commentByMove[llmMoveLog[k].move] = llmMoveLog[k].comment;
            }
        }
        for (var i = 0; i < history.length; i += 2) {
            var wMove = history[i];
            var bMove = history[i + 1] || null;
            result.push({
                moveNumber:   Math.floor(i / 2) + 1,
                white:        wMove ? wMove.san : null,
                whiteComment: (wMove && commentByMove[wMove.san]) || null,
                black:        bMove ? bMove.san : null,
                blackComment: (bMove && commentByMove[bMove.san]) || null
            });
        }
        return result;
    }
    function buildLLMPayload() {
        var rawHistory = game.history({ verbose: true });
        var turnColor  = game.turn() === 'w' ? 'white' : 'black';
        var moveNumber = Math.ceil((rawHistory.length + 1) / 2);
        return {
            fen:         game.fen(),
            pgn:         game.pgn() || '(game start)',
            moveHistory: buildMoveHistory(),
            turn:        turnColor,
            moveNumber:  moveNumber,
            legalMoves:  game.moves()
        };
    }
    function buildLLMHeaders(cfg) {
        var headers  = { 'Content-Type': 'application/json' };
        var provider = (cfg.provider || 'anthropic').toLowerCase();
        if (provider === 'anthropic') {
            headers['x-api-key']                                 = cfg.apiKey;
            headers['anthropic-version']                         = cfg.anthropicVersion || '2023-06-01';
            headers['anthropic-dangerous-direct-browser-access'] = 'true';
        } else if (provider === 'gemini') {
        } else {
            headers['Authorization'] = 'Bearer ' + cfg.apiKey;
        }
        return headers;
    }
    function buildLLMEndpoint(cfg) {
        var provider = (cfg.provider || 'anthropic').toLowerCase();
        var endpoint = cfg.endpoint || 'https://api.anthropic.com/v1/messages';
        if (provider === 'gemini' && cfg.apiKey) {
            if (endpoint.indexOf('key=') === -1) {
                endpoint += (endpoint.indexOf('?') === -1 ? '?' : '&') + 'key=' + cfg.apiKey;
            }
        }
        return endpoint;
    }
    function buildLLMRequestBody(cfg, payload) {
        var turn     = payload.turn;
        var provider = (cfg.provider || 'anthropic').toLowerCase();
        var model    = cfg.model || 'claude-opus-4-6';
        var defaultSystemPrompt =
            'You are a chess grandmaster playing as ' + turn + '. ' +
            'You will receive a JSON object with four key fields:\n' +
            '  "fen"         — the current board position in FEN notation.\n' +
            '  "pgn"         — the game so far in PGN notation.\n' +
            '  "moveHistory" — a structured array of every move played. ' +
                'Each entry has moveNumber, white (SAN), whiteComment, black (SAN), blackComment. ' +
                'Your past commentary is attached to the half-moves you played. ' +
                'Use this to maintain strategic and stylistic continuity.\n' +
            '  "legalMoves"  — the complete list of legal moves in SAN for this position.\n\n' +
            'You MUST respond with ONLY a single valid JSON object:\n' +
            '  {"move":"<SAN>","comment":"<one sentence of optional commentary>"}\n' +
            'The move value MUST be copied verbatim from the "legalMoves" array. ' +
            'Do not invent, abbreviate, or alter move notation. ' +
            'Return absolutely nothing else — no markdown, no explanation.';
        var systemPrompt = cfg.systemPrompt
            ? cfg.systemPrompt.replace('{color}', turn)
            : defaultSystemPrompt;
        var userContent = JSON.stringify(payload, null, 2);
        if (provider === 'anthropic') {
            return JSON.stringify({
                model:      model,
                max_tokens: cfg.maxTokens || 1024,
                system:     systemPrompt,
                messages:   [{ role: 'user', content: userContent }]
            });
        } else if (provider === 'gemini') {
            return JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents:          [{ parts: [{ text: userContent }] }],
                generationConfig:  { maxOutputTokens: cfg.maxTokens || 1024 }
            });
        } else {
            return JSON.stringify({
                model:      model,
                max_tokens: cfg.maxTokens || 1024,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user',   content: userContent  }
                ]
            });
        }
    }
    function extractLLMText(cfg, data) {
        var provider = (cfg.provider || 'anthropic').toLowerCase();
        if (provider === 'anthropic') {
            return data.content && data.content[0] && data.content[0].text;
        } else if (provider === 'gemini') {
            return data.candidates && data.candidates[0] &&
                   data.candidates[0].content &&
                   data.candidates[0].content.parts &&
                   data.candidates[0].content.parts[0] &&
                   data.candidates[0].content.parts[0].text;
        } else {
            return data.choices && data.choices[0] &&
                   data.choices[0].message && data.choices[0].message.content;
        }
    }
    function parseLLMResponse(text) {
        text = text.trim()
                   .replace(/^```(?:json)?\s*/i, '')
                   .replace(/\s*```$/, '')
                   .trim();
        try {
            return JSON.parse(text);
        } catch (_) {
            var m = text.match(/\{[^}]*"move"\s*:\s*"([^"]+)"[^}]*\}/);
            if (m) {
                var cm = text.match(/"comment"\s*:\s*"([^"]*)"/);
                return { move: m[1], comment: cm ? cm[1] : '' };
            }
            throw new Error('Cannot parse LLM response as JSON: ' + text.slice(0, 120));
        }
    }
    // -------------------------------------------------------------------------
    // LLM: Show paused / error status with a Retry button
    //
    // The board stays locked (isEngineRunning remains true, isLLMPaused = true).
    // The player can click Retry to re-attempt the LLM call from the same
    // position without losing any game state.
    // -------------------------------------------------------------------------
    function showLLMPausedStatus(errMsg) {
        // Inject a Retry button directly into the status bar.
        // game.retryLLMMove() is called via the public API (available as window.game).
        $('#engineStatus').html(
            '<span style="color:#c00;">LLM paused.</span> ' +
            '<button class="btn btn-soft btn-sm" style="padding:1px 8px; font-size:0.85em;" ' +
            'onclick="game.retryLLMMove()">Retry</button>' +
            '<br><small style="color:#888;">' + errMsg + '</small>'
        );
    }
    var LLM_RETRY_DELAYS = [0, 2000, 5000, 10000];
    function fetchLLMMove() {
        if (!llmConfig || !llmConfig.enabled) {
            console.warn('[LLM] fetchLLMMove called but LLM is not configured/enabled.');
            isEngineRunning = false;
            return;
        }
        var maxRetries = (llmConfig.maxRetries !== undefined)
            ? parseInt(llmConfig.maxRetries, 10)
            : 3;
        var endpoint = buildLLMEndpoint(llmConfig);
        var attempt  = llmRetryCount + 1;
        var statusPrefix = attempt > 1
            ? 'LLM thinking&hellip; (retry ' + attempt + '/' + maxRetries + ')'
            : 'LLM opponent thinking&hellip;';
        $('#engineStatus').html(statusPrefix);
        llmPausedFen = game.fen();
        var payload = buildLLMPayload();
        fetch(endpoint, {
            method:  'POST',
            headers: buildLLMHeaders(llmConfig),
            body:    buildLLMRequestBody(llmConfig, payload)
        })
        .then(function(response) {
            if (!response.ok) {
                return response.text().then(function(t) {
                    throw new Error('HTTP ' + response.status + ': ' + t.slice(0, 200));
                });
            }
            return response.json();
        })
        .then(function(data) {
            var rawText = extractLLMText(llmConfig, data);
            if (!rawText) throw new Error('Empty content in LLM response.');
            var moveData = parseLLMResponse(rawText);
            if (!moveData || !moveData.move) throw new Error('No "move" key in LLM JSON.');
            var applied = game.move(moveData.move);
            if (!applied) {
                var legalVerbose = game.moves({ verbose: true });
                var uciMatch = legalVerbose.find(function(m) {
                    return (m.from + m.to + (m.promotion || '')) === moveData.move.toLowerCase();
                });
                if (uciMatch) {
                    applied = game.move({ from: uciMatch.from, to: uciMatch.to, promotion: uciMatch.promotion });
                }
            }
            if (!applied) throw new Error('LLM returned illegal move: "' + moveData.move + '"');
            // ---- SUCCESS ----
            llmRetryCount = 0;
            llmIsPaused   = false;
            llmPausedFen  = null;
            // Record in the log (referenced by buildMoveHistory on every subsequent call)
            var rawHistory = game.history({ verbose: true });
            llmMoveLog.push({
                moveNumber: rawHistory.length,  // 1-based half-move index
                color:      applied.color === 'w' ? 'white' : 'black',
                fen:        payload.fen,
                move:       applied.san,
                comment:    moveData.comment || ''
            });
            isEngineRunning = false;
            $('button[onclick="game.undo()"]').prop('disabled', false);
            if (moveData.comment) {
                $('#engineStatus').html('LLM: ' + moveData.comment);
                setTimeout(displayStatus, 4000);
            }
            saveGameState();
            prepareMove();
        })
        .catch(function(err) {
            console.error('[LLM] Attempt ' + attempt + ' failed:', err.message);
            if (llmRetryCount < maxRetries - 1) {
                llmRetryCount++;
                var delay = LLM_RETRY_DELAYS[Math.min(llmRetryCount, LLM_RETRY_DELAYS.length - 1)];
                $('#engineStatus').html(
                    'LLM error — retrying in ' + (delay / 1000 || '<1') + 's&hellip; ' +
                    '(' + err.message.slice(0, 80) + ')'
                );
                setTimeout(fetchLLMMove, delay);
            } else {
                llmRetryCount = 0;
                llmIsPaused   = true;
                $('button[onclick="game.undo()"]').prop('disabled', false);
                showLLMPausedStatus(err.message.slice(0, 120));
                console.warn('[LLM] Game paused. Call game.retryLLMMove() to resume.');
            }
        });
    }
    var isDisplayThrottled = false;
    function throttledDisplayStatus() {
        if (!isDisplayThrottled) {
            displayStatus();
            isDisplayThrottled = true;
            setTimeout(function() { isDisplayThrottled = false; }, 250);
        }
    }
    var onDragStart = function(source, piece, position, orientation) {
        if (game.game_over() || isEngineRunning ||
            (game.turn() === 'w' && playerColor !== 'white') ||
            (game.turn() === 'b' && playerColor !== 'black')) {
            return false;
        }
    };
    function uciCmd(cmd, which) { (which || engine).postMessage(cmd); }
    uciCmd('uci');
    function displayStatus() {
        var opponentLabel = (llmConfig && llmConfig.enabled)
            ? 'LLM (' + (llmConfig.model || 'default') + ')'
            : 'Engine';
        var status = opponentLabel + ': ';
        if      (!engineStatus.engineLoaded) status += 'Loading...';
        else if (!engineStatus.engineReady)  status += 'Loaded...';
        else                                 status += 'On.';
        if (engineStatus.search && !(llmConfig && llmConfig.enabled)) {
            status += ' ' + engineStatus.search.replace(/Depth: \d+ Nps: \d+/, '');
        }
        if (engineStatus.score && displayScore) {
            var scoreText = engineStatus.score;
            if (!scoreText.startsWith('Checkmate')) scoreText = 'Score: ' + scoreText;
            status += ' | ' + scoreText;
        }
        var gameStatusText = '';
        if (game.game_over()) {
            if      (game.in_checkmate())             gameStatusText = 'Checkmate!';
            else if (game.in_stalemate())              gameStatusText = 'Stalemate.';
            else if (game.in_threefold_repetition())   gameStatusText = 'Draw by Repetition.';
            else if (game.insufficient_material())     gameStatusText = 'Draw by Insufficient Material.';
            else if (game.in_draw())                   gameStatusText = 'Draw.';
        } else if (game.in_check()) {
            gameStatusText = 'Check! ';
        }
        var turn       = game.turn() === 'w' ? 'White' : 'Black';
        var turnStatus = game.game_over() ? '' : turn + ' to move.';
        $('#engineStatus').html(status + ' ' + gameStatusText + turnStatus);
    }
    function saveGameState() {
        try {
            if (!game.game_over()) {
                localStorage.setItem('savedChessGame', JSON.stringify({
                    fen:        game.fen(),
                    playerColor: playerColor,
                    skillLevel: time.level || 0
                }));
            } else {
                localStorage.removeItem('savedChessGame');
            }
        } catch (e) { console.error('Could not save game to localStorage.', e); }
    }
    function prepareMove() {
        $('#pgn').text(game.pgn());
        $('#pgn').scrollTop($('#pgn')[0].scrollHeight);
        board.position(game.fen());
        displayStatus();
        var turn = game.turn() == 'w' ? 'white' : 'black';
        if (!game.game_over()) {
            if (turn != playerColor) {
                $('button[onclick="game.undo()"]').prop('disabled', true);
                isEngineRunning = true;
                llmRetryCount   = 0;
                llmIsPaused     = false;
                if (llmConfig && llmConfig.enabled) {
                    var delay = (llmConfig.moveDelayMs !== undefined)
                        ? llmConfig.moveDelayMs
                        : 800;
                    setTimeout(fetchLLMMove, delay);
                } else {
                    setTimeout(function() {
                        var goCommand = 'go';
                        if (time.depth)         goCommand += ' depth '    + time.depth;
                        else if (time.movetime) goCommand += ' movetime ' + time.movetime;
                        uciCmd('position fen ' + game.fen());
                        uciCmd(goCommand);
                    }, 2000);
                }
            }
        }
    }
    engine.onmessage = function(event) {
        var line = event.data || event;
        if (line === 'uciok') {
            engineStatus.engineLoaded = true;
            if (typeof options.onReady === 'function') options.onReady();
        } else if (line === 'readyok') {
            engineStatus.engineReady = true;
        } else {
            var match;
            if (match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/)) {
                isEngineRunning = false;
                var move = { from: match[1], to: match[2], promotion: match[3] };
                if (typeof onBestMoveCallback === 'function') {
                    onBestMoveCallback(move);
                    onBestMoveCallback = null;
                    return;
                }
                $('button[onclick="game.undo()"]').prop('disabled', false);
                game.move(move);
                prepareMove();
            } else if (match = line.match(/^info .*/)) {
                if (match = line.match(/depth (\d+) .* nps (\d+)/)) {
                    engineStatus.search = 'Depth: ' + match[1] + ' Nps: ' + match[2];
                }
                if (match = line.match(/score (\w+) (-?\d+)/)) {
                    var score = parseInt(match[2]) * (game.turn() === 'w' ? 1 : -1);
                    if (match[1] === 'cp') {
                        engineStatus.score = (score / 100.0).toFixed(2);
                    } else if (match[1] === 'mate') {
                        engineStatus.score = 'Checkmate in ' + Math.abs(score);
                    }
                }
                throttledDisplayStatus();
                return;
            }
        }
        displayStatus();
    };
    var onDrop = function(source, target) {
        var moveCfg = { from: source, to: target, promotion: undefined };
        var piece = game.get(source);
        if (piece && piece.type === 'p' &&
            ((piece.color === 'w' && source.charAt(1) === '7' && target.charAt(1) === '8') ||
             (piece.color === 'b' && source.charAt(1) === '2' && target.charAt(1) === '1'))) {
            moveCfg.promotion = document.getElementById('promote').value;
        }
        var move = game.move(moveCfg);
        if (move === null) return 'snapback';
        saveGameState();
        prepareMove();
    };
    var onSnapEnd = function() { board.position(game.fen()); };
    var cfg = { draggable: true, position: 'start', onDragStart, onDrop, onSnapEnd };
    board = new ChessBoard('board', cfg);
    return {
        reset: function() {
            game.reset();
            board.position('start');
            localStorage.removeItem('savedChessGame');
            uciCmd('ucinewgame');
            uciCmd('isready');
            engineStatus.engineReady = false;
            engineStatus.search      = null;
            llmMoveLog    = [];
            llmRetryCount = 0;
            llmIsPaused   = false;
            llmPausedFen  = null;
            this.setSkillLevel(0);
            prepareMove();
        },
        loadPgn: function(pgn) { game.load_pgn(pgn); },
        setPlayerColor: function(color) {
            playerColor = color;
            board.orientation(playerColor);
        },
        setSkillLevel: function(skill) {
            skill = Math.max(0, Math.min(20, parseInt(skill, 10)));
            time.level = skill;
            $('#skillLevel').val(skill);
            uciCmd('setoption name Skill Level value ' + skill);
            delete time.depth;
            delete time.movetime;
            if (skill <= 5) { time.depth = skill > 0 ? skill : 1; }
            else            { time.movetime = 100 + (skill * 150); }
        },
        start: function() { this.reset(); },
        undo: function() {
            if (isEngineRunning && !llmIsPaused) return false;
            if (game.history().length < 2) return false;
            game.undo();
            game.undo();
            if (llmMoveLog.length) llmMoveLog.pop();
            engineStatus.search = null;
            isEngineRunning     = false;
            llmIsPaused         = false;
            llmRetryCount       = 0;
            llmPausedFen        = null;
            $('button[onclick="game.undo()"]').prop('disabled', false);
            displayStatus();
            prepareMove();
            return true;
        },
        getFen: function() {
            var fenInput = document.getElementById('fen');
            if (fenInput) fenInput.value = game.fen();
        },
        loadFen: function() {
            var fenString = document.getElementById('fen').value;
            if (game.load(fenString)) {
                $('#pgn').text(game.pgn());
                board.position(game.fen());
                displayStatus();
                var turn = game.turn() == 'w' ? 'white' : 'black';
                if (!game.game_over() && turn != playerColor) {
                    $('button[onclick="game.undo()"]').prop('disabled', true);
                    if (llmConfig && llmConfig.enabled) {
                        isEngineRunning = true;
                        llmRetryCount   = 0;
                        llmIsPaused     = false;
                        setTimeout(fetchLLMMove, 800);
                    } else {
                        var goCommand = 'go';
                        if (time.depth)         goCommand += ' depth '    + time.depth;
                        else if (time.movetime) goCommand += ' movetime ' + time.movetime;
                        uciCmd('position fen ' + game.fen());
                        uciCmd(goCommand);
                        isEngineRunning = true;
                    }
                }
            } else {
                var orig = $('#engineStatus').html();
                $('#engineStatus').html('Invalid FEN string.');
                setTimeout(function() { $('#engineStatus').html(orig); }, 4000);
            }
        },
        moveNotation: function() {
            var moveInput  = document.getElementById('moveNotation');
            var moveString = moveInput.value.trim().toLowerCase();
            if (!moveString) return;
            var legalMoves = game.moves();
            var foundMove  = null;
            for (var i = 0; i < legalMoves.length; i++) {
                if (legalMoves[i].replace(/[+#=x]/g, '').toLowerCase() === moveString) {
                    foundMove = legalMoves[i];
                    break;
                }
            }
            if (foundMove && game.move(foundMove)) {
                saveGameState();
                prepareMove();
                moveInput.value = '';
            } else {
                var orig = $('#engineStatus').html();
                $('#engineStatus').html('Invalid move: ' + moveInput.value.trim());
                setTimeout(function() { $('#engineStatus').html(orig); }, 4000);
            }
        },
        resumeGame: function(savedState) {
            uciCmd('isready');
            game.load(savedState.fen);
            this.setPlayerColor(savedState.playerColor);
            this.setSkillLevel(savedState.skillLevel);
            board.position(game.fen());
            $('#pgn').text(game.pgn());
            $('#pgn').scrollTop($('#pgn')[0].scrollHeight);
            var turn = game.turn() == 'w' ? 'white' : 'black';
            if (!game.game_over() && turn != playerColor) prepareMove();
            displayStatus();
        },
        loadPuzzle: function(fen) {
            game.reset();
            game.load(fen);
            board.position(fen);
            var turn = game.turn() === 'w' ? 'white' : 'black';
            this.setPlayerColor(turn);
            $('input[name="playerColor"][value="' + turn + '"]').prop('checked', true);
            time.level = 20;
            uciCmd('setoption name Skill Level value 20');
            delete time.depth;
            time.movetime = 100 + (20 * 150);
            uciCmd('ucinewgame');
            uciCmd('position fen ' + fen);
            $('#pgn').text('');
            displayStatus();
        },
        getCurrentFen: function() { return game.fen(); },
        getBestMove: function(fen, callback) {
            onBestMoveCallback = function(move) {
                var tempGame   = new Chess(fen);
                var moveResult = tempGame.move(move);
                if (moveResult) callback(moveResult.san);
            };
            uciCmd('position fen ' + fen);
            uciCmd('go movetime 3000');
        },
        setLLMConfig: function(config) {
            if (!config || typeof config !== 'object') {
                llmConfig = null;
                displayStatus();
                return;
            }
            llmConfig = config;
            console.log('[LLM] Config set. Enabled:', !!config.enabled,
                        '| Model:', config.model || '(default)',
                        '| maxRetries:', config.maxRetries !== undefined ? config.maxRetries : 3);
            if (config.enabled) {
                console.info('[LLM] LLM opponent is now active. The Enable/Disable toggle is ' +
                             'locked in the UI while a config is loaded. Use "Clear" in the LLM ' +
                             'panel, or start a New Game, to deactivate the LLM opponent.');
            }
            displayStatus();
        },
        isLLMEnabled: function() {
            return !!(llmConfig && llmConfig.enabled);
        },
        retryLLMMove: function() {
            if (!llmIsPaused) {
                console.log('[LLM] retryLLMMove called but game is not paused — no-op.');
                return;
            }
            console.log('[LLM] Resuming paused game from FEN:', llmPausedFen);
            llmRetryCount = 0;
            llmIsPaused   = false;
            $('button[onclick="game.undo()"]').prop('disabled', true);
            fetchLLMMove();
        },
        exportLLMLog: function() {
            return JSON.stringify({
                model:       llmConfig ? (llmConfig.model || 'unknown') : 'none',
                playerColor: playerColor,
                pgn:         game.pgn(),
                currentFen:  game.fen(),
                moveHistory: buildMoveHistory(),
                llmMoves:    llmMoveLog,
                exported:    new Date().toISOString()
            }, null, 2);
        }
    };
}
