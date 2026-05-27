import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://miowdqqwqelawdunbfbu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb3dkcXF3cWVsYXdkdW5iZmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MzU5MTksImV4cCI6MjA5NTIxMTkxOX0.23yYZNEVmSOTLUW5m_2I3s5iLoq4R8KDjl4tY8Fh_IU"
);