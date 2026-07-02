/**
 * Data-layer facade. Presents a uniform async interface and picks a backend:
 * Supabase Postgres when SUPABASE_URL is configured (dev with cloud + the
 * Vercel deployment), otherwise the local SQLite backend (used by the test
 * suite, which injects an in-memory DB via _setDbForTests).
 *
 * SQLite is imported dynamically so `better-sqlite3`'s native binary is never
 * loaded on Vercel serverless (where SUPABASE_URL is always set).
 */
import type {
  BlueprintCategory,
  Chunk,
  NewAnswer,
  NewChatMessage,
  NewQuestion,
  Question,
  QuestionFilter,
} from "./types";
import * as supabase from "./supabase";

const useSupabase = !!process.env.SUPABASE_URL;

// Lazy SQLite loader — resolves to the same cached module instance the test
// suite imports statically, so an injected test DB is shared.
type Sqlite = typeof import("./sqlite");
function sq(): Promise<Sqlite> {
  return import("./sqlite");
}

export async function searchChunks(query: string, limit: number) {
  return useSupabase ? supabase.searchChunks(query, limit) : (await sq()).searchChunks(query, limit);
}

export async function getChunkById(id: string) {
  return useSupabase ? supabase.getChunkById(id) : (await sq()).getChunkById(id);
}

export async function insertQuestion(q: NewQuestion) {
  return useSupabase ? supabase.insertQuestion(q) : (await sq()).insertQuestion(q);
}

export async function listQuestions(filter: QuestionFilter = {}) {
  return useSupabase ? supabase.listQuestions(filter) : (await sq()).listQuestions(filter);
}

export async function getQuestionsByCategory(cat: BlueprintCategory, n: number) {
  return useSupabase
    ? supabase.getQuestionsByCategory(cat, n)
    : (await sq()).getQuestionsByCategory(cat, n);
}

export async function randomMock() {
  return useSupabase ? supabase.randomMock() : (await sq()).randomMock();
}

export async function getQuestionById(id: number) {
  return useSupabase ? supabase.getQuestionById(id) : (await sq()).getQuestionById(id);
}

export async function createAttempt() {
  return useSupabase ? supabase.createAttempt() : (await sq()).createAttempt();
}

export async function recordAnswer(a: NewAnswer) {
  return useSupabase ? supabase.recordAnswer(a) : (await sq()).recordAnswer(a);
}

export async function attemptExists(attemptId: number) {
  return useSupabase ? supabase.attemptExists(attemptId) : (await sq()).attemptExists(attemptId);
}

export async function completeAttempt(attemptId: number) {
  return useSupabase ? supabase.completeAttempt(attemptId) : (await sq()).completeAttempt(attemptId);
}

export async function getAttemptScore(attemptId: number) {
  return useSupabase ? supabase.getAttemptScore(attemptId) : (await sq()).getAttemptScore(attemptId);
}

export async function attemptStats() {
  return useSupabase ? supabase.attemptStats() : (await sq()).attemptStats();
}

export async function attemptHistory() {
  return useSupabase ? supabase.attemptHistory() : (await sq()).attemptHistory();
}

export async function missedQuestions() {
  return useSupabase ? supabase.missedQuestions() : (await sq()).missedQuestions();
}

export async function completedQuestions() {
  return useSupabase ? supabase.completedQuestions() : (await sq()).completedQuestions();
}

export async function saveChatMessage(m: NewChatMessage) {
  return useSupabase ? supabase.saveChatMessage(m) : (await sq()).saveChatMessage(m);
}

export async function listChatMessages(session: string) {
  return useSupabase ? supabase.listChatMessages(session) : (await sq()).listChatMessages(session);
}

export type { Chunk, Question };
