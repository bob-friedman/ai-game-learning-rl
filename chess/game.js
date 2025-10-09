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

    var engineStatus = {
        engineLoaded: false,
        engineReady: false,
        search: null,
        score: null,
        pv: null
    };

    var isDisplayThrottled = false;
    function throttledDisplayStatus() {
        if (!isDisplayThrottled) {
            displayStatus();
            isDisplayThrottled = true;
            setTimeout(function() {
                isDisplayThrottled = false;
            }, 250);
        }
    }
    var onDragStart = function(source, piece, position, orientation) {
        if (game.game_over() || isEngineRunning ||
            (game.turn() === 'w' && playerColor !== 'white') ||
            (game.turn() === 'b' && playerColor !== 'black')) {
            return false;
        }
    };

    function uciCmd(cmd, which) {
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

    function saveGameState() {
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

    function prepareMove() {
        $('#pgn').text(game.pgn());
        $('#pgn').scrollTop($('#pgn')[0].scrollHeight);
        board.position(game.fen());
        displayStatus();

        var turn = game.turn() == 'w' ? 'white' : 'black';
        if(!game.game_over()) {
            if(turn != playerColor) {
                setTimeout(function() {
                    $('button[onclick="game.undo()"]').prop('disabled', true);
                    var goCommand = "go";
                    if (time.depth) goCommand += " depth " + time.depth;
                    else if (time.movetime) goCommand += " movetime " + time.movetime;
                
                    uciCmd('position fen ' + game.fen());
                    uciCmd(goCommand);
                    isEngineRunning = true;
                }, 2000);
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
            engineStatus.search = null;
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

            if (skill <= 5) {
                time.depth = skill > 0 ? skill : 1;
            } else {
                time.movetime = 100 + (skill * 150);
            }
        },
        start: function() {
            this.reset();
        },
        undo: function() {
            if (isEngineRunning || game.history().length < 2) return false;
            game.undo();
            game.undo();
            engineStatus.search = null;
            displayStatus();
            prepareMove();
            return true;
        },
        getFen: function() {
            var fenInput = document.getElementById('fen');
            if (fenInput) { fenInput.value = game.fen(); }
        },
        loadFen: function() {
            var fenString = document.getElementById('fen').value;
            if (game.load(fenString)) {
                $('#pgn').text(game.pgn());
                board.position(game.fen());
                displayStatus();
                var turn = game.turn() == 'w' ? 'white' : 'black';
                if (!game.game_over()) {
                    if (turn != playerColor) {
                        $('button[onclick="game.undo()"]').prop('disabled', true);
                        var goCommand = "go";
                        if (time.depth) goCommand += " depth " + time.depth;
                        else if (time.movetime) goCommand += " movetime " + time.movetime;
                        uciCmd('position fen ' + game.fen());
                        uciCmd(goCommand);
                        isEngineRunning = true;
                    }
                }
            } else {
                var originalStatus = $('#engineStatus').html();
                $('#engineStatus').html('Invalid FEN string.');
                setTimeout(function () {
                    $('#engineStatus').html(originalStatus);
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
                saveGameState();
                prepareMove();
                moveInput.value = '';
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
            $('#pgn').scrollTop($('#pgn')[0].scrollHeight);
            var turn = game.turn() == 'w' ? 'white' : 'black';
            if (!game.game_over()) {
                if (turn != playerColor) {
                    prepareMove();
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
        getCurrentFen: function() {
            return game.fen();
        },
        getBestMove: function(fen, callback) {
            onBestMoveCallback = function(move) {
                var tempGame = new Chess(fen);
                var moveResult = tempGame.move(move);
                if (moveResult) { callback(moveResult.san); }
            };
            uciCmd('position fen ' + fen);
            uciCmd('go movetime 3000');
        }
    };
}
