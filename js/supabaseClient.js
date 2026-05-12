"use strict";

(function () {
    const SUPABASE_URL = "https://gqujhfpkmmmipuwschpu.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWpoZnBrbW1taXB1d3NjaHB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMjUzMzUsImV4cCI6MjA5MzcwMTMzNX0.kmpTpN5dvahcGyCzSrt154pNo9dJPlqhah0rxx9icy8";

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        throw new Error("Supabase JS no cargado. Inclui el script de supabase-js antes de supabaseClient.js");
    }

    if (SUPABASE_ANON_KEY.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWpoZnBrbW1taXB1d3NjaHB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMjUzMzUsImV4cCI6MjA5MzcwMTMzNX0.kmpTpN5dvahcGyCzSrt154pNo9dJPlqhah0rxx9icy8")) {
        console.warn("Configura SUPABASE_ANON_KEY en js/supabaseClient.js");
    }

    window.SupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
