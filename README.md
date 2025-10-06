# Open Source Games for Reinforcement Learning

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.17273373.svg)](https://doi.org/10.5281/zenodo.17273373)

This repository has a collection of open-source games designed for use in reinforcement learning (RL) research and development. The games provide diverse environments for training and testing AI agents, with a focus on strategic thinking, puzzle-solving, and tactical gameplay. These features allow for adaptation for the generation of data that is used in training an AI model by the methods of reinforcement learning.

## Games

### Chess

![Chess Icon](docs/images/icon_chess.png)

Chess is a classic game, in this case supported by the Stockfish v11 chess engine, offering a range of skill levels for players as a challenge against an AI opponent. The game has a simple interface with options to customize gameplay, track the state of the game board, along with a selection of endgame chess puzzles for testing skills for tactical advantage.

The primary objective is to outmaneuver the AI and achieve checkmate. The user interface includes features such as drag-and-drop piece movement, undoing previous moves, and starting new games at various skill levels. For advanced users, there is an option to load and save the game state in FEN (Forsyth-Edwards Notation) format, which is accessible by a copy/paste of text operation. The current match is also stored in the browser's local storage, allowing for a resumption of a match at a later time.

#### Platform

This web browser version of Chess supports both desktop and mobile devices. On slower devices or at higher skill levels, the chess engine may take a few seconds for a move, which may cause a brief delay in the availability of the user interface.

#### Puzzles

The puzzles in Chess are for delivering checkmate in two moves. First, find the key move that initiates the checkmating sequence, and the AI will respond with its best possible defense. Then deliver the final checkmating move. This is a traditional exercise designed to sharpen one's tactical vision. For a hint, a *best move* option is available in the puzzles section.

Chess v1 includes both historical and computationally curated puzzle sets. The curated set of 1,180 puzzles originated from a set of 329,951 chess positions as derived the Lichess database (theme: mateIn2), and depended on a validation step against the Stockfish v17 engine (see scripts/ in this archive).

#### Sources of Data

-   [https://www.wtharvey.com/m8n2.txt](https://www.wtharvey.com/m8n2.txt)
-   [https://database.lichess.org/#puzzles](https://database.lichess.org/#puzzles)

#### Screenshot

![Chess Screenshot 1](docs/images/screenshot_1_chess.png)

### Boxes

![Boxes Icon](docs/images/icon_boxes.png)

Boxes is a minimalist puzzle game that challenges players with logic and spatial reasoning. Inspired by the classic Sokoban genre, the objective is to solve carefully designed levels by pushing boxes to their designated goal locations. The game emphasizes thoughtful planning over quick reflexes.

#### Gameplay

The core objective in each level is to maneuver the player character to push every box onto a goal tile. A level is complete only when all boxes are situated on all goals. The primary challenge arises from the layout of the walls and the placement of the boxes. Players must think ahead to avoid pushing boxes into corners or against walls where they can no longer be moved. The game features collections of levels that progressively introduce more complex arrangements.

#### Controls

Boxes supports multiple control schemes to accommodate different platforms and player preferences.

-   **Keyboard**: For desktop play, movement is controlled with the Arrow Keys or the W, A, S, and D keys. Players can undo their most recent move by pressing U or Z. The current level can be reset at any time by pressing the R key.
-   **Touch and On-Screen Interface**: On touch-enabled devices, players can move by swiping in the desired direction. For more precise control, an on-screen D-pad can be toggled. The user interface also provides dedicated buttons to undo a move or reset the level.

#### Screenshot

![Boxes Screenshot](docs/images/screenshot_1_boxes.png)

## Installation

To run the games locally, clone this repository and serve the directory chess/ or boxes/ via a web server. This step will make the games available to a web browser. A local web server may be used: `python3 -m http.server`, which defaults to port 8000.

```bash
git clone https://github.com/bob-friedman/ai-game-learning-rl.git
```

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.

## Data Retrieval Entry Points

The games in this repository are designed to be transparent and accessible for AI research. The following sections detail the primary functions and variables that can be used to extract game state, history, and other relevant data for training reinforcement learning models.

### Chess

The core logic for the Chess game is located in `chess/game.js`. The `engineGame` object provides several methods to access game data:

-   **`game.fen()`**: Returns the Forsyth-Edwards Notation (FEN) string, which describes the current board state in a single line of text. This is ideal for capturing a snapshot of the board at any given moment.
-   **`game.pgn()`**: Returns the Portable Game Notation (PGN) string, which provides a complete record of the moves played in the current game. This is useful for analyzing entire game sequences.
-   **`get_moves()`**: This function returns a space-separated string of all moves made in the current game, which can be useful for move analysis.
-   **`localStorage.getItem('savedChessGame')`**: The game automatically saves the current state to the browser's local storage. This JSON object contains the FEN string, the player's color, and the AI's skill level, allowing for game resumption and data extraction.
-   **`loadPuzzle(fen)`**: This function allows you to load a specific board position using a FEN string, which is useful for setting up specific scenarios for an AI agent to solve.

### Boxes

The Boxes game logic is contained in `boxes/boxes.js`. The game state is managed through several key JavaScript variables:

-   **`board`**: A 2D array representing the static layout of the level, including walls and floor tiles.
-   **`player`**: An object containing the player's current `x` and `y` coordinates.
-   **`boxes`**: An array of objects, where each object represents a box and its `x` and `y` coordinates.
-   **`goals`**: An array of objects that stores the `x` and `y` coordinates of the goal locations.
-   **`undoStack`**: This array stores a history of previous game states. Each element in the stack is an object containing the player and box positions for a prior move, making it an excellent source for sequential training data.
-   **`parseSokobanLevels(text)`**: This function can be used to load custom level data in the Sokoban format, allowing for the creation of new and varied training environments.

## Contributors

This project was developed by a team of dedicated individuals. We are grateful to all our contributors for their hard work and commitment.

If you would like to contribute to this project, please follow the guidelines in our contributing documentation.
