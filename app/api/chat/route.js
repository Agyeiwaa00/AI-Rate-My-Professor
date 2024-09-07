import { NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

const systemPrompt = `
You are a "Rate My Professor" assistant designed to help students find the best professors based on their queries. Your role is to understand each user's question, retrieve relevant information using Retrieval-Augmented Generation (RAG), and provide the top 3 professors that best match their criteria. Ensure your responses are clear, concise, and directly address the student's needs. Include relevant details such as the professor's rating, subject expertise, and any notable student feedback. If the query is ambiguous, ask follow-up questions to clarify the student's requirements before proceeding with the search
`;

export async function POST(req) {
  const data = await req.json();

  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
  const index = pc.index("rag").namespace("ns1");

  const openai = new OpenAI({
    apiKey: '',
  });

  const text = data[data.length - 1].content;
  const embedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",  // Ensure this model exists
    input: text,
    encoding_format: "float",
  });

  const results = await index.query({
    topK: 3,
    includeMetadata: true,
    vector: embedding.data[0].embedding,
  });

  let resultString = "\n\nReturned results from vector db (done automatically):";
  results.matches.forEach((match) => {
    resultString += `
         Professor: ${match.id}
         Review: ${match.metadata.review}
         Subject: ${match.metadata.subject}
         Stars: ${match.metadata.stars}\n\n`;
  });

  const lastMessage = data[data.length - 1];
  const lastMessageContent = lastMessage.content + resultString;
  const lastDataWithoutLastMessage = data.slice(0, data.length - 1);
  
  const completion = await openai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      ...lastDataWithoutLastMessage,  // Spread the previous messages
      { role: "user", content: lastMessageContent },
    ],
    model: "gpt-3.5-turbo",  // Ensure correct model name
    stream: true,
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            const text = encoder.encode(content);
            controller.enqueue(text);
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream);
}
/* export async function POST(req) {
  const data = await req.json();

  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
  const index = pc.Index("rag").namespace("ns1");
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const text = data[data.length - 1].content;
  const embedding = openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
    encoding_format: "float",
  });

  const results = await index.query({
    topK: 3,
    includeMetadata: true,
    vector: embedding.data[0].embedding,
  });

  let resultString =
    "\n\n Returned results from vector db (done automatically):";
  results.matches.forEach((match) => {
    resultString += `n\n
         Professor:${match.id}
         Review:${match.metadata.stars}
         Subject:${match.metadata.subject}
         Stars:${match.metadata.stars}
         \n\n
        `;
  });

  const lastMessage = data[data.length - 1];
  const lastMessageContent = lastMessage.content + resultString;
  const lastDataWithoutLastMessage = data.slice(0, data.length - 1);

  const completion = await openai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      ...lastDataWithoutLastMessage,
      { role: "user", content: lastMessageContent },
    ],
    model: "gpt-4",
    system: true,
  });

  // Stream response back to the client
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();  // TextEncoder, not TextDecoder
      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            const text = encoder.encode(content);
            controller.enqueue(text);
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
  
  return new NextResponse(stream);
}*/
