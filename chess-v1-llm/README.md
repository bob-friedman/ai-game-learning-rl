# Chess v1-LLM

An experimental version of Chess v1 that allows playing against Large Language Models (LLMs) via direct API access.

## LLM Configuration

To enable the LLM opponent, you must configure a valid API key and endpoint. The game provides a dedicated interface for this purpose.

### Configuration via UI

1. Open the **Menu** on the main board.
2. Click the **LLM** button to open the configuration modal.
3. Choose your **Provider** (Anthropic, Gemini, or OpenAI-compatible).
4. Enter your **API Key** and the appropriate **Endpoint**.
5. Select a **Model** (e.g., `claude-3-5-sonnet-20240620`).
6. Click **Apply & Save**.

The game will automatically save your configuration (excluding the API key) to the browser's local storage.

## Security and Usage Warning

> [!IMPORTANT]
> **Security Risk**: If you configure the application using a `llm_config.json` file, your API key is stored in plain text within that file. If this application is served on the public internet, the `llm_config.json` file may be accessible to unauthorized users, exposing your API key.
>
> To protect your credentials, it is **highly recommended** to:
> - Access the application via `file:///` protocol.
> - Or, serve the application only to `localhost` (127.0.0.1).
>
> **Usage Costs**: Be aware that using LLM providers typically incurs costs per query. Users should monitor their API usage and billing through their respective provider's dashboard.

### Configuration via File (`llm_config.json`)

You can also pre-configure the application by creating a file named `llm_config.json` in the same directory as `index.html`. The application will attempt to load this file automatically on startup.

**Example Template:**
```json
{
  "enabled": true,
  "provider": "anthropic",
  "endpoint": "https://api.anthropic.com/v1/messages",
  "apiKey": "sk-ant-...",
  "model": "claude-3-5-sonnet-20240620",
  "moveDelayMs": 800
}
```

## Supported Providers

- **Anthropic**: Uses the Messages API. Requires `x-api-key` and `anthropic-version` headers. Supports direct browser access.
- **Google Gemini**: Authenticates via a `key` query parameter in the endpoint URL.
- **OpenAI-compatible**: Supports any provider following the OpenAI Chat Completions API format.

## Features

- **Strategic Continuity**: The LLM is provided with the full game history and its own past commentary to ensure its moves and comments remain strategically and stylistically consistent.
- **Exportable Logs**: Use the **Export Move Log** button in the LLM modal to download a detailed JSON record of the match, including the LLM's perspective on each move.
- **Retry Logic**: If an API call fails, the game will attempt a series of retries. If all retries fail, the game enters a "paused" state. You can click the **Retry** button in the status bar to re-attempt the move from the same position.

## Technical Details

The LLM is expected to respond with a JSON object containing a `move` (in SAN or UCI format) and an optional `comment`. The move must be one of the legal moves provided in the request payload.

**Example Response:**
```json
{
  "move": "e4",
  "comment": "Opening with the King's Pawn to control the center."
}
```
