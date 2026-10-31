import os
import subprocess
from pathlib import Path
from typing import Callable, Any

from config import WORKSPACE_ROOT


class Tool:
    def __init__(
        self,
        name: str,
        description: str,
        func: Callable[..., Any],
        parameters: dict[str, Any]
    ):
        self.name = name
        self.description = description
        self.func = func
        self.parameters = parameters

    def to_ollama_schema(self) -> dict[str, Any]:
        """Convert to Ollama tool call schema format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def execute(self, **kwargs) -> Any:
        return self.func(**kwargs)


# ---------------------------------------------------------------------------
# Tool Implementations
# ---------------------------------------------------------------------------

def read_file(filepath: str) -> str:
    """Read the contents of a file in the workspace."""
    target = (WORKSPACE_ROOT / filepath).resolve()
    if not str(target).startswith(str(WORKSPACE_ROOT)):
        return f"Error: Path {filepath} is outside the workspace."

    if not target.exists():
        return f"Error: File {filepath} does not exist."
    if not target.is_file():
        return f"Error: {filepath} is not a file."

    try:
        return target.read_text(encoding="utf-8")
    except Exception as e:
        return f"Error reading file: {e}"


def list_directory(path: str = ".") -> str:
    """List the contents of a directory in the workspace."""
    target = (WORKSPACE_ROOT / path).resolve()
    if not str(target).startswith(str(WORKSPACE_ROOT)):
        return f"Error: Path {path} is outside the workspace."

    if not target.exists():
        return f"Error: Directory {path} does not exist."
    if not target.is_dir():
        return f"Error: {path} is not a directory."

    try:
        items = os.listdir(target)
        if not items:
            return "Directory is empty."
        return "\n".join(items)
    except Exception as e:
        return f"Error listing directory: {e}"


def write_file(filepath: str, content: str) -> str:
    """Write content to a file in the workspace. Creates parent directories if needed."""
    target = (WORKSPACE_ROOT / filepath).resolve()
    if not str(target).startswith(str(WORKSPACE_ROOT)):
        return f"Error: Path {filepath} is outside the workspace."

    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return f"Successfully wrote {len(content)} bytes to {filepath}"
    except Exception as e:
        return f"Error writing file: {e}"


def run_command(command: str) -> str:
    """Run a shell command in the workspace directory. Returns stdout + stderr."""
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=str(WORKSPACE_ROOT),
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += "\n[stderr]\n" + result.stderr
        if result.returncode != 0:
            output += f"\n[exit code: {result.returncode}]"
        # Cap output to prevent massive context injection
        if len(output) > 5000:
            output = output[:5000] + "\n...(truncated)"
        return output or "(no output)"
    except subprocess.TimeoutExpired:
        return "Error: Command timed out after 30 seconds."
    except Exception as e:
        return f"Error running command: {e}"


# ---------------------------------------------------------------------------
# Available Tools Registration
# ---------------------------------------------------------------------------

AVAILABLE_TOOLS: dict[str, Tool] = {
    "read_file": Tool(
        name="read_file",
        description="Read the text contents of a file.",
        func=read_file,
        parameters={
            "type": "object",
            "properties": {
                "filepath": {
                    "type": "string",
                    "description": "Relative path to the file in the workspace (e.g. 'src/main.py')",
                }
            },
            "required": ["filepath"],
        }
    ),
    "list_directory": Tool(
        name="list_directory",
        description="List the contents of a directory.",
        func=list_directory,
        parameters={
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the directory (use '.' for root)",
                }
            },
            "required": ["path"],
        }
    ),
    "write_file": Tool(
        name="write_file",
        description="Write or overwrite a file with the given content. Creates parent directories automatically.",
        func=write_file,
        parameters={
            "type": "object",
            "properties": {
                "filepath": {
                    "type": "string",
                    "description": "Relative path to the file (e.g. 'src/hello.py')",
                },
                "content": {
                    "type": "string",
                    "description": "The full text content to write to the file.",
                }
            },
            "required": ["filepath", "content"],
        }
    ),
    "run_command": Tool(
        name="run_command",
        description="Execute a shell command in the workspace directory and return stdout/stderr. Timeout is 30 seconds.",
        func=run_command,
        parameters={
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute (e.g. 'python hello.py' or 'pytest tests/')",
                }
            },
            "required": ["command"],
        }
    ),
}

