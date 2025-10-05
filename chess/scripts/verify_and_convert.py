import chess
import chess.engine
import json
import sys

# --- Configuration ---
STOCKFISH_PATH = "./stockfish"  # For Linux/macOS
# STOCKFISH_PATH = "./stockfish.exe" # For Windows

if len(sys.argv) < 2:
    print("Usage: python verify_and_convert.py <input_fen_file.txt>", flush=True)
    sys.exit(1)

input_fen_file = sys.argv[1]
output_json_file = 'puzzles_verified_mate_in_2.json'

verified_puzzles = []
total_processed = 0
total_valid = 0

print("Starting verification process. This may take a very long time.", flush=True)

try:
    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        with open(input_fen_file, 'r') as f:
            for i, line in enumerate(f):
                fen = line.strip()
                if not fen:
                    continue

                total_processed += 1
                board = chess.Board(fen)

                try:
                    limit = chess.engine.Limit(depth=15)
                    info = engine.analyse(board, limit)
                    
                    score_pov = info.get("score")

                    if score_pov is not None:
                        score = score_pov.pov(board.turn)
                        if isinstance(score, chess.engine.Mate) and score.moves == 2:
                            total_valid += 1
                            verified_puzzles.append({
                                "text": f"Puzzle {total_valid}",
                                "fen": fen
                            })
                            print(f"VALID puzzle found! Total valid: {total_valid} / {total_processed} processed.", flush=True)
                        
                except Exception as e:
                    print(f"Error analyzing FEN {fen}: {e}", flush=True)

                if total_processed % 100 == 0:
                    print(f"Progress: {total_processed} positions checked...", flush=True)

    print(f"\n--- Verification Complete ---", flush=True)
    print(f"Processed {total_processed} positions.", flush=True)
    print(f"Found {total_valid} confirmed mate-in-two puzzles.", flush=True)

    with open(output_json_file, 'w') as json_file:
        json.dump(verified_puzzles, json_file, indent=2)

    print(f"Successfully created '{output_json_file}'.", flush=True)
    print("Rename this file to 'puzzles.json' to use it in your app.", flush=True)

except FileNotFoundError:
    print(f"\nERROR: Could not find the Stockfish executable at '{STOCKFISH_PATH}'", flush=True)
    print("Please download it from stockfishchess.org and place it in this directory.", flush=True)
except Exception as e:
    print(f"An unexpected error occurred: {e}", flush=True)
