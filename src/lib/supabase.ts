import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url) throw new Error("VITE_SUPABASE_URL is not set");
if (!anonKey) throw new Error("VITE_SUPABASE_ANON_KEY is not set");

export const supabase = createClient(url, anonKey);
