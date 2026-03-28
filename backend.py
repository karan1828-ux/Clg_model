load_dotenv()
import os
import json
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client
import openai
from langchain.memory import ConversationBufferMemory
from langchain.schema import messages_from_dict, messages_to_dict


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# --- LangChain memory setup ---
memories = {}

def get_memory(thread_id):
    if thread_id not in memories:
        memories[thread_id] = ConversationBufferMemory(return_messages=True)
    return memories[thread_id]

# --- Pydantic models ---
class ChatRequest(BaseModel):
    message: str
    thread_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    agent: str

# --- Supabase-powered tools for OpenAI function-calling ---
def get_teachers_for_subject(subject: str) -> str:
    sub_res = supabase.table("subjects").select("id").eq("name", subject).execute()
    if not sub_res.data:
        return f"No subject found with name '{subject}'."
    subject_id = sub_res.data[0]["id"]
    fac_res = supabase.table("faculty").select("name").eq("subject_id", subject_id).execute()
    if fac_res.data:
        return f"Teachers for {subject}: {', '.join([f['name'] for f in fac_res.data])}"
    return f"No teachers found for subject '{subject}'."

def get_course_list() -> str:
    res = supabase.table("courses").select("name").execute()
    if res.data:
        return "Courses: " + ", ".join([c["name"] for c in res.data])
    return "No courses found."

def get_facility_info(query: str) -> str:
    # Placeholder: Replace with real Supabase query if you have a facilities table
    facilities = {
        "library": "Library open 8am-10pm.",
        "gym": "Gym open 6am-9pm.",
        "canteen": "Canteen open 8am-8pm."
    }
    for key, val in facilities.items():
        if key in query.lower():
            return val
    return "Facility information not found."

# --- OpenAI function-calling tool schemas ---
tool_schemas = [
    {
        "type": "function",
        "function": {
            "name": "get_teachers_for_subject",
            "description": "Get the teachers for a given subject.",
            "parameters": {
                "type": "object",
                "properties": {"subject": {"type": "string", "description": "The subject name."}},
                "required": ["subject"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_course_list",
            "description": "Get a list of all courses offered.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_facility_info",
            "description": "Get information about a campus facility.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Facility name or query."}},
                "required": ["query"],
            },
        },
    },
]

def call_tool(tool_call):
    fn = tool_call["function"]
    name = fn["name"]
    args = json.loads(fn.get("arguments", "{}"))
    if name == "get_teachers_for_subject":
        return get_teachers_for_subject(args.get("subject", ""))
    elif name == "get_course_list":
        return get_course_list()
    elif name == "get_facility_info":
        return get_facility_info(args.get("query", ""))
    else:
        return "Tool not implemented."

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    thread_id = request.thread_id or "default"
    memory = get_memory(thread_id)
    # Add user message to memory
    memory.save_context({"input": request.message}, {})
    messages = [
        {"role": "system", "content": "You are a helpful college assistant. Use the available tools to answer questions about courses, subjects, years, faculty, and facilities."},
        {"role": "user", "content": request.message},
    ]
    # Add conversation history
    for m in messages_from_dict(memory.buffer_as_messages):
        if m.type == "human":
            messages.insert(-1, {"role": "user", "content": m.content})
        elif m.type == "ai":
            messages.insert(-1, {"role": "assistant", "content": m.content})
    while True:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tool_schemas,
            tool_choice="auto",
        )
        msg = response.choices[0].message
        if msg.tool_calls:
            tool_outputs = []
            for tool_call in msg.tool_calls:
                tool_result = call_tool(tool_call)
                tool_outputs.append({
                    "tool_call_id": tool_call["id"],
                    "output": tool_result,
                })
            # Add tool outputs to messages and continue
            messages.append({"role": "assistant", "content": None, "tool_calls": msg.tool_calls})
            for tool_call, tool_output in zip(msg.tool_calls, tool_outputs):
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": tool_call["function"]["name"],
                    "content": tool_output["output"],
                })
            continue
        else:
            # Save assistant response to memory
            memory.save_context({}, {"output": msg.content})
            return ChatResponse(response=msg.content, agent="openai-gpt-function-calling")

# --- For local testing ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 