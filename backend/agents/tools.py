import os
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
    # Ensure safe path resolution within workspace
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
}
