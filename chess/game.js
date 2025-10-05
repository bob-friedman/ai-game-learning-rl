function engineGame(options) {
    options = options || {}
    var game = new Chess();
    var board;
    var engine = STOCKFISH();
    var onBestMoveCallback = null
    var displayScore = false;
    var time = {};
    var playerColor = 'white';
    var isEngineRunning = false;
    var announced_game_over;

    var onDragStart = function(source, piece, position, orientation) {
        if (game.game_over() === true ||
            (game.turn() === 'w' && playerColor !== 'white') ||
            (game.turn() === 'b' && playerColor !== 'black')) {
            return false;
        }
    };

    setInterval(function ()
    {
        if (announced_game_over) {
            return;
        }
        
        if (game.game_over()) {
            announced_game_over = true;
        }
    }, 1000);

    function uciCmd(cmd, which) {
        console.log("UCI: " + cmd);
        
        (which || engine).postMessage(cmd);
    }
    uciCmd('uci');

    function displayStatus() {
        var status = 'Engine: ';
        if(!engineStatus.engineLoaded) {
            status += 'Loading...';
        } else if(!engineStatus.engineReady) {
            status += 'Loaded...';
        } else {
            status += 'On.';
        }

        if (engineStatus.search) {
            status += ' ' + engineStatus.search.replace(/Depth: \d+ Nps: \d+/, '');
        }
    
        if(engineStatus.score && displayScore) {
            var scoreText = engineStatus.score;
            if (!scoreText.startsWith('Checkmate')) {
                scoreText = 'Score: ' + scoreText;
            }
            status += ' | ' + scoreText;
        }
    
        var gameStatusText = '';
        if (game.game_over()) {
            if (game.in_checkmate()) {
                gameStatusText = 'Checkmate!';
            } else if (game.in_stalemate()) {
               gameStatusText = 'Stalemate.';
            } else if (game.in_threefold_repetition()) {
               gameStatusText = 'Draw by Repetition.';
            } else if (game.insufficient_material()) {
               gameStatusText = 'Draw by Insufficient Material.';
            } else if (game.in_draw()) {
               gameStatusText = 'Draw.';
            }
        } else if (game.in_check()) {
            gameStatusText = 'Check! ';
        }
    
        var turn = game.turn() === 'w' ? 'White' : 'Black';
        var turnStatus = game.game_over() ? '' : turn + ' to move.';
        $('#engineStatus').html(status + ' ' + gameStatusText + turnStatus);
    }

    function get_moves()
    {
        var moves = '';
        var history = game.history({verbose: true});
        
        for(var i = 0; i < history.length; ++i) {
            var move = history[i];
            moves += ' ' + move.from + move.to + (move.promotion ? move.promotion : '');
        }
        
        return moves;
    }

    function prepareMove() {
        $('#pgn').text(game.pgn());
        setTimeout(function() { document.getElementById('pgn').scrollTop = 9999; });
        board.position(game.fen());
        displayStatus();
        var turn = game.turn() == 'w' ? 'white' : 'black';
        if(!game.game_over()) {
            if(turn != playerColor) {
                $('button[onclick="game.undo()"]').prop('disabled', true);
                uciCmd('position fen ' + game.fen());
                uciCmd("go " + (time.movetime ? "movetime " + time.movetime : ""));
                isEngineRunning = true;
            }
        }
        try {
            if (!game.game_over()) {
                const gameState = {
                    fen: game.fen(),
                    playerColor: playerColor,
                    skillLevel: time.level || 0
                };
                localStorage.setItem('savedChessGame', JSON.stringify(gameState));
            } else {
                localStorage.removeItem('savedChessGame');
            }
        } catch (e) {
            console.error("Could not save game to localStorage.", e);
        }
    }
    
    engine.onmessage = function(event) {
        var line;
        
        if (event && typeof event === "object") {
            line = event.data;
        } else {
            line = event;
        }
        console.log("Reply: " + line)
        if(line == 'uciok') {
            engineStatus.engineLoaded = true;
               if (typeof options.onReady === 'function') {
                   options.onReady();
               }
        } else if(line == 'readyok') {
            engineStatus.engineReady = true;
        } else {
            var match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
            if(match) {
                isEngineRunning = false;
                var move = {from: match[1], to: match[2], promotion: match[3]};

                if (typeof onBestMoveCallback === 'function') {
                    onBestMoveCallback(move);
                    onBestMoveCallback = null;
                    return;
                }

                $('button[onclick="game.undo()"]').prop('disabled', false);
                game.move(move);
                if (game.in_check()) { $('#engineStatus').text('Check!'); }
                prepareMove();
            } else if (match = line.match(/^info .*\bdepth (\d+) .*\bnps (\d+)/)) {
                engineStatus.search = 'Depth: ' + match[1] + ' Nps: ' + match[2];
            }
            
            if(match = line.match(/^info .*\bscore (\w+) (-?\d+)/)) {
                var score = parseInt(match[2]) * (game.turn() == 'w' ? 1 : -1);
                if(match[1] == 'cp') {
                    engineStatus.score = (score / 100.0).toFixed(2);
                } else if(match[1] == 'mate') {
                    engineStatus.score = 'Checkmate in ' + Math.abs(score);
                }
                
                if(match = line.match(/\b(upper|lower)bound\b/)) {
                    engineStatus.score = ((match[1] == 'upper') == (game.turn() == 'w') ? '<= ' : '>= ') + engineStatus.score;
                }
                if (match = line.match(/\bpv\s([a-h][1-8][a-h][1-8][qrbn]?)/)) {
                    engineStatus.pv = match[1];
                }
            }
        }
        displayStatus();
    };

    var onDrop = function(source, target) {
        var moveCfg = {
            from: source,
            to: target,
            promotion: undefined
        };

        var piece = game.get(source);
        if (piece && piece.type === 'p' &&
            ((piece.color === 'w' && source.charAt(1) === '7' && target.charAt(1) === '8') ||
             (piece.color === 'b' && source.charAt(1) === '2' && target.charAt(1) === '1'))) {
            moveCfg.promotion = document.getElementById("promote").value;
        }

        var move = game.move(moveCfg);

        if (move === null) return 'snapback';

        prepareMove();
    };

    var onSnapEnd = function() {
        board.position(game.fen());
    };

    var cfg = {
        showErrors: true,
        draggable: true,
        position: 'start',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    };

    board = new ChessBoard('board', cfg);

    return {
        reset: function() {
            game.reset();
           localStorage.removeItem('savedChessGame');
            uciCmd('setoption name Contempt value 0');
            this.setSkillLevel(0);
        },
        loadPgn: function(pgn) { game.load_pgn(pgn); },
        setPlayerColor: function(color) {
            playerColor = color;
            board.orientation(playerColor);
        },
        setSkillLevel: function(skill) {
            var max_err,
                err_prob;
            
            skill = parseInt(skill);
            if (skill < 0) {
                skill = 0;
            }
            if (skill > 20) {
                skill = 20;
            }
            
            time.level = skill;
            
            time.movetime = 500 + (skill * 200);
            
            uciCmd('setoption name Skill Level value ' + skill);
            
            err_prob = Math.round((skill * 6.35) + 1);
            max_err = Math.round((skill * -0.5) + 10);
            
            uciCmd('setoption name Skill Level Maximum Error value ' + max_err);
            uciCmd('setoption name Skill Level Probability value ' + err_prob);
        },
        setDepth: function(depth) {
            time = { depth: depth };
        },
        setNodes: function(nodes) {
            time = { nodes: nodes };
        },
        setContempt: function(contempt) {
            uciCmd('setoption name Contempt value ' + contempt);
        },
        setAggressiveness: function(value) {
            uciCmd('setoption name Aggressiveness value ' + value);
        },
        setDisplayScore: function(flag) {
            displayScore = flag;
            displayStatus();
        },
        start: function() {
            uciCmd('ucinewgame');
            uciCmd('isready');
            engineStatus.engineReady = false;
            engineStatus.search = null;
            displayStatus();
            prepareMove();
            announced_game_over = false;
        },
        undo: function() {
            if (game.history().length === 0) return false;
            if(isEngineRunning)
                return false;
            game.undo();
            game.undo();
            engineStatus.search = null;
            displayStatus();
            prepareMove();
            return true;
        },
        getFen: function() {
            var fenInput = document.getElementById('fen');
            if (fenInput) {
                fenInput.value = game.fen();
            }
        },
        loadFen: function() {
            var fenString = document.getElementById('fen').value;
            if (game.load(fenString)) {
                $('#pgn').text(game.pgn());
                board.position(game.fen());
                var turn = game.turn() == 'w' ? 'white' : 'black';
                if (!game.game_over()) {
                    if (turn != playerColor) {
                        $('button[onclick="game.undo()"]').prop('disabled', true);
                        uciCmd('position fen ' + game.fen());
                        uciCmd("go " + (time.movetime ? "movetime " + time.movetime : ""));
                        isEngineRunning = true;
                    }
                }
            } else {
                $('#engineStatus').html('Invalid FEN string.');
                setTimeout(function () {
                    displayStatus();
                }, 4000);
            }
        },
        moveNotation: function() {
            var moveInput = document.getElementById('moveNotation');
            var moveString = moveInput.value.trim().toLowerCase();
            if (!moveString) return;

            var legalMoves = game.moves();
            var foundMove = null;

            for (var i = 0; i < legalMoves.length; i++) {
                var sanitizedMove = legalMoves[i].replace(/[+#=x]/g, '').toLowerCase();
                
                if (sanitizedMove === moveString) {
                    foundMove = legalMoves[i];
                    break;
                }
            }

            if (foundMove && game.move(foundMove)) {
                prepareMove();
                moveInput.value = ''; // Clear input on successful move
            } else {
                var originalStatus = $('#engineStatus').html();
                $('#engineStatus').html('Invalid move: ' + moveInput.value.trim());
                setTimeout(function () {
                    $('#engineStatus').html(originalStatus);
                }, 4000);
            }
        },
        resumeGame: function(savedState) {
            uciCmd('isready');
            game.load(savedState.fen);
            this.setPlayerColor(savedState.playerColor);
            this.setSkillLevel(savedState.skillLevel);
            board.position(game.fen());
            $('#pgn').text(game.pgn());
            setTimeout(function() { document.getElementById('pgn').scrollTop = 9999; });
            var turn = game.turn() == 'w' ? 'white' : 'black';
            if (!game.game_over()) {
                if (turn != playerColor) {
                    uciCmd('position fen ' + game.fen());
                    uciCmd("go " + (time.movetime ? "movetime " + time.movetime : ""));
                    isEngineRunning = true;
                }
            }
            displayStatus();
        },
        loadPuzzle: function(fen) {
            game.reset();
            game.load(fen);
            board.position(fen);
            var turn = game.turn() === 'w' ? 'white' : 'black';
            this.setPlayerColor(turn);
            // Add this line to update the UI radio button
            $('input[name="playerColor"][value="' + turn + '"]').prop('checked', true);
            this.setSkillLevel(20);
            uciCmd('ucinewgame');
            uciCmd('position fen ' + fen);
            $('#pgn').text('');
            displayStatus();
            announced_game_over = false;
        },
        getCurrentFen: function() {
            return game.fen();
        },
        getBestMove: function(fen, callback) {
            onBestMoveCallback = function(move) {
                var tempGame = new Chess(fen);
                var moveResult = tempGame.move(move);
                if (moveResult) {
                    callback(moveResult.san);
                }
            };
            uciCmd('position fen ' + fen);
            uciCmd('go movetime 3000');
        }
    };
}
