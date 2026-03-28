const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Memory storage for conversations
const memories = new Map();

function getMemory(threadId) {
if (!memories.has(threadId)) {
memories.set(threadId, []);
}
return memories.get(threadId);
}

// Function to fetch teachers for a subject
async function getTeachersForSubject(subject) {
try {
const { data: subjectData, error: subjectError } = await supabase
.from('subjects')
.select('id')
.eq('name', subject)
.single();

    if (subjectError || !subjectData) {
        return `No subject found with name '${subject}'.`;
    }

    const { data: facultyData, error: facultyError } = await supabase
        .from('faculty')
        .select('name')
        .eq('subject_id', subjectData.id);

    if (facultyError || !facultyData || facultyData.length === 0) {
        return `No teachers found for subject '${subject}'.`;
    }

    const teacherNames = facultyData.map(f => f.name).join(', ');
    return `Teachers for ${subject}: ${teacherNames}`;
} catch (error) {
    return `Error fetching teachers for ${subject}: ${error.message}`;
}
}

// Function to fetch course list
async function getCourseList() {
try {
const { data, error } = await supabase.from('courses').select('name');

    if (error || !data || data.length === 0) {
        return "No courses found.";
    }

    const courseNames = data.map(c => c.name).join(', ');
    return `Courses: ${courseNames}`;
} catch (error) {
    return `Error fetching courses: ${error.message}`;
}
}

// Function to fetch facility info
function getFacilityInfo(query) {
const facilities = {
"library": "Library open 8am-10pm.",
"gym": "Gym open 6am-9pm.",
"canteen": "Canteen open 8am-8pm."
};

for (const [key, val] of Object.entries(facilities)) {
    if (query.toLowerCase().includes(key)) {
        return val;
    }
}
return "Facility information not found.";
}

// Function to fetch subjects for all years of a course
async function getSubjectsForCourse(courseName) {
try {
const { data: courseData, error: courseError } = await supabase
.from('courses')
.select('id')
.eq('name', courseName)
.single();

    if (courseError || !courseData) {
        return `No course found with name '${courseName}'.`;
    }

    const { data: yearsData, error: yearsError } = await supabase
        .from('years')
        .select('id, year_number')
        .eq('course_id', courseData.id);

    if (yearsError || !yearsData || yearsData.length === 0) {
        return `No years found for course '${courseName}'.`;
    }

    const subjectPromises = yearsData.map(async (year) => {
        const { data: subjectsData, error: subjectsError } = await supabase
            .from('subjects')
            .select('name')
            .eq('year_id', year.id);

        if (subjectsError || !subjectsData || subjectsData.length === 0) {
            return `No subjects found for year ${year.year_number}.`;
        }

        return {
            year: year.year_number,
            subjects: subjectsData.map(s => s.name)
        };
    });

    const subjectsByYear = await Promise.all(subjectPromises);
    return subjectsByYear.map(year => 
        `Year ${year.year}: ${year.subjects.join(', ')}`
    ).join('\n');
} catch (error) {
    return `Error fetching subjects for course '${courseName}': ${error.message}`;
}
}

// Function to fetch the total number of subjects in a course
async function getNumberOfSubjectsInCourse(courseName) {
try {
const { data: courseData, error: courseError } = await supabase
.from('courses')
.select('id')
.eq('name', courseName)
.single();

    if (courseError || !courseData) {
        return `No course found with name '${courseName}'.`;
    }

    const { data: yearsData, error: yearsError } = await supabase
        .from('years')
        .select('id')
        .eq('course_id', courseData.id);

    if (yearsError || !yearsData || yearsData.length === 0) {
        return `No years found for course '${courseName}'.`;
    }

    let totalSubjects = 0;

    for (const year of yearsData) {
        const { data: subjectsData, error: subjectsError } = await supabase
            .from('subjects')
            .select('id')
            .eq('year_id', year.id);

        if (subjectsError) {
            return `Error fetching subjects for year ${year.year_number}: ${subjectsError.message}`;
        }

        totalSubjects += subjectsData.length;
    }

    return `Total number of subjects in ${courseName}: ${totalSubjects}`;
} catch (error) {
    return `Error fetching number of subjects for course '${courseName}': ${error.message}`;
}
}

// // --- Embedding generation utility (OpenAI v3) ---
// const { Configuration, OpenAIApi } = require('openai');
// const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
// const openaiV3 = new OpenAIApi(configuration);

async function generateEmbeddings(documents) {
for (const document of documents) {
const input = document.replace(/\n/g, ' ');
const embeddingResponse = await openai.embeddings.create({
model: 'text-embedding-ada-002',
input,
});
const [{ embedding }] = embeddingResponse.data;
await supabase.from('documents').insert({
content: document,
embedding,
});
}
}

// Update toolSchemas to include all tools
const toolSchemas = [
{
type: "function",
function: {
name: "get_teachers_for_subject",
description: "Get the teachers for a given subject.",
parameters: {
type: "object",
properties: {
subject: {
type: "string",
description: "The subject name."
}
},
required: ["subject"]
}
}
},
{
type: "function",
function: {
name: "get_course_list",
description: "Get a list of all courses offered.",
parameters: {
type: "object",
properties: {},
required: []
}
}
},
{
type: "function",
function: {
name: "get_facility_info",
description: "Get information about a campus facility.",
parameters: {
type: "object",
properties: {
query: {
type: "string",
description: "Facility name or query."
}
},
required: ["query"]
}
}
},
{
type: "function",
function: {
name: "get_subjects_for_course",
description: "Get all subjects for a given course.",
parameters: {
type: "object",
properties: {
courseName: {
type: "string",
description: "The course name."
}
},
required: ["courseName"]
}
}
},
{
type: "function",
function: {
name: "get_number_of_subjects_in_course",
description: "Get the total number of subjects in a given course.",
parameters: {
type: "object",
properties: {
courseName: {
type: "string",
description: "The course name."
}
},
required: ["courseName"]
}
}
}
];

// Update callTool to support all tools
async function callTool(toolCall) {
const fn = toolCall.function;
const name = fn.name;
const args = JSON.parse(fn.arguments || '{}');

switch (name) {
    case 'get_teachers_for_subject':
        return await getTeachersForSubject(args.subject || '');
    case 'get_course_list':
        return await getCourseList();
    case 'get_facility_info':
        return getFacilityInfo(args.query || '');
    case 'get_subjects_for_course':
        return await getSubjectsForCourse(args.courseName || '');
    case 'get_number_of_subjects_in_course':
        return await getNumberOfSubjectsInCourse(args.courseName || '');
    default:
        return "Tool not implemented.";
}
}

// Utility: Cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
return dot / (normA * normB);
}

// Semantic search endpoint
app.post('/semantic-search', async (req, res) => {
const { query } = req.body;
if (!query) {
return res.status(400).json({ error: 'Please provide a query string.' });
}
try {
// Generate embedding for the query
const embeddingResponse = await openai.embeddings.create({
model: 'text-embedding-ada-002',
input: query.replace(/\n/g, ' '),
});
const [{ embedding: queryEmbedding }] = embeddingResponse.data;

    // Fetch all documents and their embeddings
    const { data: docs, error } = await supabase.from('documents').select('content, embedding');
    if (error || !docs || docs.length === 0) {
        return res.status(404).json({ error: 'No documents found.' });
    }

    // Compute similarity for each document
    const scored = docs.map(doc => ({
        content: doc.content,
        score: cosineSimilarity(queryEmbedding, doc.embedding)
    }));
    // Sort by similarity (descending)
    scored.sort((a, b) => b.score - a.score);
    // Return the best match (or top N if you want)
    res.json({
        best_match: scored[0],
        top_matches: scored.slice(0, 3)
    });
} catch (error) {
    res.status(500).json({ error: 'Semantic search failed', message: error.message });
}
});

// Restrict /generate-embeddings endpoint with API key
app.post('/generate-embeddings', (req, res, next) => {
const apiKey = req.headers['x-api-key'];
if (apiKey !== process.env.ADMIN_API_KEY) {
return res.status(401).json({ error: 'Unauthorized' });
}
next();
}, async (req, res) => {
const { documents } = req.body;
if (!Array.isArray(documents) || documents.length === 0) {
return res.status(400).json({ error: 'Please provide a non-empty array of documents.' });
}
try {
await generateEmbeddings(documents);
res.json({ status: 'ok', message: 'Embeddings generated and stored.' });
} catch (error) {
res.status(500).json({ error: 'Failed to generate embeddings', message: error.message });
}
});

// Update /chat endpoint to include semantic search context
app.post('/chat', async (req, res) => {
try {
const { message, thread_id } = req.body;
const threadId = thread_id || 'default';
const memory = getMemory(threadId);

    // Add user message to memory
    memory.push({ role: 'user', content: message });

    // --- Semantic Search for context ---
    let semanticContext = '';
    try {
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: message.replace(/\n/g, ' '),
        });
        const [{ embedding: queryEmbedding }] = embeddingResponse.data;
        const { data: docs, error } = await supabase.from('documents').select('content, embedding');
        if (!error && docs && docs.length > 0) {
            const scored = docs.map(doc => ({
                content: doc.content,
                score: cosineSimilarity(queryEmbedding, doc.embedding)
            }));
            scored.sort((a, b) => b.score - a.score);
            if (scored[0] && scored[0].score > 0.75) { // Only use if reasonably relevant
                semanticContext = scored[0].content;
            }
        }
    } catch (e) {
        // If semantic search fails, just skip context
    }

    // Build messages for LLM
    const messages = [
        {
            role: 'system',
            content: semanticContext
                ? `Knowledge base context: ${semanticContext}`
                : 'You are a helpful college assistant. Use the available tools to answer questions about courses, subjects, years, faculty, and facilities.'
        },
        ...memory
    ];

    let response;
    let toolCalls = [];

    do {
        response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            tools: toolSchemas,
            tool_choice: 'auto'
        });

        const msg = response.choices[0].message;
        toolCalls = msg.tool_calls || [];

        if (toolCalls.length > 0) {
            // Add assistant message with tool calls
            messages.push({
                role: 'assistant',
                content: null,
                tool_calls: toolCalls
            });

            // Execute tools and add results
            for (const toolCall of toolCalls) {
                const toolResult = await callTool(toolCall);
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolCall.function.name,
                    content: toolResult
                });
            }
        }
    } while (toolCalls.length > 0);

    const assistantMessage = response.choices[0].message.content;
    
    // Add assistant response to memory
    memory.push({ role: 'assistant', content: assistantMessage });

    res.json({
        response: assistantMessage,
        agent: 'openai-gpt-function-calling'
    });

} catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
}
});

// Health check endpoint
app.get('/health', (req, res) => {
res.json({ status: 'OK', message: 'College Virtual Assistant Backend is running' });
});

// Start server
app.listen(port, () => {
console.log('Server running on http: //localhost:${port}');
console.log('College Virtual Assistant Backend is ready!');
});

module.exports = app;

// node backend.js
// python -m http.server 8081