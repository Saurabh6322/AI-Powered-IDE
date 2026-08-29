import json
import logging
from typing import Any

from agents.tools import AVAILABLE_TOOLS

logger = logging.getLogger(__name__)

def process_tool_calls(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Look at the last message in the conversation.
    If it is an assistant message with `tool_calls`, execute them and append
    the results as `tool` role messages.
    Returns the extended message list.
    """
    if not messages:
        return messages

    last_msg = messages[-1]
    
    # If the last message isn't an assistant tool call, there's nothing to execute.
    if last_msg.get("role") != "assistant" or not last_msg.get("tool_calls"):
        return messages

    # The user has approved execution. Run the tools.
    new_messages = list(messages)
    
    for tc in last_msg["tool_calls"]:
        func_info = tc.get("function", {})
        name = func_info.get("name")
        args_dict = func_info.get("arguments", {})
        
        # Ollama sometimes returns arguments as a JSON string rather than a dict
        if isinstance(args_dict, str):
            try:
                args_dict = json.loads(args_dict)
            except Exception:
                args_dict = {}

        logger.info(f"Executing tool: {name} with args: {args_dict}")
        
        tool = AVAILABLE_TOOLS.get(name)
        if not tool:
            result_content = f"Error: Tool '{name}' not found."
        else:
            try:
                result_content = tool.execute(**args_dict)
                # Ensure it's a string
                if not isinstance(result_content, str):
                    result_content = str(result_content)
            except Exception as e:
                result_content = f"Error executing {name}: {e}"
        
        # Append the tool result
        new_messages.append({
            "role": "tool",
            "content": result_content,
            "name": name,  # Sometimes needed by LLMs to map the result to the call
        })
        
    return new_messages
