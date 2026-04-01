import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isValid = (val: any) => {
  return typeof val === 'string' && val.trim().length > 0 && val !== 'undefined' && val !== 'null';
};

let supabaseInstance: any = null;

if (isValid(supabaseUrl) && isValid(supabaseAnonKey)) {
  try {
    // Diagnostic log (masked)
    console.log('Initializing Supabase client with URL:', supabaseUrl.substring(0, 10) + '...');
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.error('Supabase client initialization failed:', err);
    supabaseInstance = null;
  }
} else {
  console.warn('Supabase credentials missing or invalid in environment.');
}

export const supabase = supabaseInstance;

if (!supabase) {
  console.warn('Supabase credentials missing or invalid. Realtime features will be disabled.');
}
