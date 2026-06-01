import { createClient } from "@supabase/supabase-js";

// Wrap every fetch with a 15-second timeout so requests suspended while a
// browser tab is backgrounded never hang indefinitely.
const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const SUPABASE_URL = "https://miowdqqwqelawdunbfbu.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb3dkcXF3cWVsYXdkdW5iZmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MzU5MTksImV4cCI6MjA5NTIxMTkxOX0.23yYZNEVmSOTLUW5m_2I3s5iLoq4R8KDjl4tY8Fh_IU";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    global: {
      fetch: fetchWithTimeout,
    },
  }
);