import asyncio
import os
import sys
import xml.etree.ElementTree as ET
from typing import List, Dict, Any
import json
import argparse

# Check for required packages
try:
    from anthropic import Anthropic
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
except ImportError:
    print("Missing required packages. Please run:")
    print("pip install anthropic mcp")
    sys.exit(1)

# Configuration
SERVER_SCRIPT = "./dist/index.js"
EVALUATION_FILE = "evaluation.xml"
MODEL = os.environ.get("MODEL", "claude-3-5-sonnet-20241022")

def save_evaluation_file(qa_pairs: List[Dict[str, str]], filepath: str):
    """Save the updated QA pairs back to the XML file."""
    root = ET.Element("evaluation")
    for pair in qa_pairs:
        qa_pair = ET.SubElement(root, "qa_pair")
        question = ET.SubElement(qa_pair, "question")
        question.text = pair["question"]
        answer = ET.SubElement(qa_pair, "answer")
        answer.text = pair["answer"]
    
    # Indent for pretty printing
    ET.indent(root, space="  ", level=0)
    tree = ET.ElementTree(root)
    
    try:
        tree.write(filepath, encoding="UTF-8", xml_declaration=True)
        print(f"\n✅ Successfully saved updates to {filepath}")
    except Exception as e:
        print(f"\n❌ Error saving updates: {e}")

async def run_evaluation():
    parser = argparse.ArgumentParser(description="Run OmniFocus MCP Evaluation")
    parser.add_argument("--update", action="store_true", help="Interactive mode to update ground truth answers")
    args = parser.parse_args()

    # 1. Check prerequisites
    if not os.path.exists(SERVER_SCRIPT):
        print(f"Error: Server script not found at {SERVER_SCRIPT}")
        print("Please run 'npm run build' first.")
        return

    if not os.path.exists(EVALUATION_FILE):
        print(f"Error: Evaluation file not found at {EVALUATION_FILE}")
        return

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set.")
        return

    # 2. Parse questions
    try:
        tree = ET.parse(EVALUATION_FILE)
        root = tree.getroot()
        qa_pairs = []
        for pair in root.findall('qa_pair'):
            q = pair.find('question').text
            a = pair.find('answer').text
            qa_pairs.append({"question": q.strip(), "answer": a.strip()})
        
        print(f"Loaded {len(qa_pairs)} questions from {EVALUATION_FILE}")
    except Exception as e:
        print(f"Error parsing {EVALUATION_FILE}: {e}")
        return

    # 3. Connect to MCP Server
    print(f"Starting MCP server: {SERVER_SCRIPT}")
    server_params = StdioServerParameters(
        command="node",
        args=[SERVER_SCRIPT],
        env=os.environ.copy()
    )

    client = Anthropic()
    results = []
    updates_made = False

    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # List tools to provide to Claude
                tools_result = await session.list_tools()
                anthropic_tools = [{
                    "name": tool.name,
                    "description": tool.description,
                    "input_schema": tool.inputSchema
                } for tool in tools_result.tools]
                
                print(f"Connected to server. Found {len(anthropic_tools)} tools.")

                for i, pair in enumerate(qa_pairs):
                    print(f"\n--- Question {i+1}/{len(qa_pairs)} ---")
                    print(f"Q: {pair['question']}")
                    
                    messages = [{"role": "user", "content": pair['question']}]
                    
                    # First turn: Get tool calls
                    response = client.messages.create(
                        model=MODEL,
                        max_tokens=1024,
                        messages=messages,
                        tools=anthropic_tools
                    )
                    
                    # Process tool calls
                    final_answer = ""
                    
                    if response.stop_reason == "tool_use":
                        messages.append({"role": "assistant", "content": response.content})
                        
                        # Execute tools
                        tool_results = []
                        for block in response.content:
                            if block.type == "tool_use":
                                print(f"  [Tool Call] {block.name}: {block.input}")
                                result = await session.call_tool(block.name, block.input)
                                
                                tool_content = result.content
                                # Convert TextContent/ImageContent to string for Anthropic
                                content_str = ""
                                for item in tool_content:
                                    if hasattr(item, 'text'):
                                        content_str += item.text
                                    else:
                                        content_str += str(item)
                                        
                                tool_results.append({
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": content_str
                                })
                                print(f"  [Tool Result] Length: {len(content_str)} chars")

                        messages.append({"role": "user", "content": tool_results})
                        
                        # Second turn: Get final answer
                        final_response = client.messages.create(
                            model=MODEL,
                            max_tokens=1024,
                            messages=messages,
                            tools=anthropic_tools
                        )
                        
                        # Extract text from final response
                        for block in final_response.content:
                            if block.type == "text":
                                final_answer += block.text
                    else:
                        # No tool use, just text
                        for block in response.content:
                            if block.type == "text":
                                final_answer += block.text

                    final_answer = final_answer.strip()
                    print(f"A: {final_answer}")
                    print(f"Expected: {pair['answer']}")
                    
                    # Simple containment check for pass/fail
                    passed = pair['answer'].lower() in final_answer.lower()
                    
                    if not passed and args.update:
                        print(f"\n⚠️  MISMATCH DETECTED")
                        print(f"Expected: {pair['answer']}")
                        print(f"Actual:   {final_answer}")
                        
                        # Interactive prompt
                        user_input = input(f"Update ground truth to '{final_answer}'? (y/n): ").lower()
                        if user_input == 'y':
                            qa_pairs[i]['answer'] = final_answer
                            updates_made = True
                            passed = True # Treat as passed since we updated the truth
                            print("✅ Updated in memory.")
                        else:
                            print("❌ Keeping original answer.")

                    status = "✅ PASS" if passed else "❌ FAIL"
                    print(f"Status: {status}")
                    
                    results.append({
                        "question": pair['question'],
                        "expected": pair['answer'],
                        "actual": final_answer,
                        "passed": passed
                    })

    except Exception as e:
        print(f"\nError running evaluation: {e}")
        import traceback
        traceback.print_exc()

    # Save if updates were made
    if updates_made:
        save_evaluation_file(qa_pairs, EVALUATION_FILE)

    # Summary
    print("\n=== Evaluation Summary ===")
    passed_count = sum(1 for r in results if r['passed'])
    print(f"Total: {len(results)}")
    print(f"Passed: {passed_count}")
    print(f"Failed: {len(results) - passed_count}")
    if len(results) > 0:
        print(f"Accuracy: {passed_count / len(results) * 100:.1f}%")

if __name__ == "__main__":
    asyncio.run(run_evaluation())
