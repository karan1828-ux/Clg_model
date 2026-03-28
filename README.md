# College Virtual Assistant 🎓🤖

An AI-powered virtual assistant designed to help students quickly find information about college courses, faculty, syllabus details, and campus facilities. This project features a clean, responsive web interface and **two interchangeable backends** (Node.js and Python) powered by OpenAI and Supabase.

## ✨ Features

* **Interactive Chat Interface:** A sleek, Tailwind-styled chat UI with typing indicators and quick-action buttons.
* **Intelligent Function Calling:** Uses OpenAI's function calling to dynamically fetch real-time data from the database based on user queries.
* **Dual Backend Options:** Choose between a Node.js/Express server or a Python/FastAPI server to power the chat.
* **Semantic Search (Node.js only):** Utilizes OpenAI's `text-embedding-ada-002` to retrieve and provide context from document embeddings.
* **Conversation Memory:** Maintains chat history for contextual follow-up questions.

## 🛠️ Tech Stack

* **Frontend:** HTML5, Vanilla JavaScript, Tailwind CSS
* **Databases/BaaS:** Supabase (PostgreSQL)
* **AI Engine:** OpenAI API (GPT-4o)
* **Backend A:** Node.js, Express
* **Backend B:** Python, FastAPI, LangChain

---

## 🔀 The Two Backends: What's the Difference?

This project was built with experimentation in mind, resulting in two distinct backend implementations that serve the exact same frontend on `http://localhost:8000/chat`. 

### 1. `backend.js` (Node.js / Express)
* **The Feature-Rich Server:** This is the more advanced backend.
* **Memory Management:** Uses a custom native JavaScript `Map` to store thread history.
* **Exclusive Features:** Includes endpoints for generating vector embeddings (`/generate-embeddings`) and performing semantic search (`/semantic-search`). It actively intercepts the chat to inject relevant knowledge-base context into the LLM's system prompt using cosine similarity.

### 2. `backend.py` (Python / FastAPI)
* **The Streamlined Server:** A lightweight, highly efficient Python implementation.
* **Memory Management:** Leverages **LangChain** (`ConversationBufferMemory`) for elegant and robust conversation history tracking.
* **Features:** Focuses purely on the core conversational agent and Supabase tool-calling. It currently does *not* include the embedding generation or semantic search routes found in the Node version.

---

## 🚀 Getting Started

### Prerequisites
You will need API keys for the following services:
* OpenAI
* Supabase

Create a `.env` file in your root directory and add your credentials:
```env
OPENAI_API_KEY=your_openai_api_key_here
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
ADMIN_API_KEY=your_custom_admin_key_for_embeddings # Only required for backend.js
