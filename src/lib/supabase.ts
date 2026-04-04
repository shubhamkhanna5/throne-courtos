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
    console.log('Supabase Anon Key length:', supabaseAnonKey.length);
    
    // Check if key is a JWT and extract project ref
    try {
      const parts = supabaseAnonKey.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        console.log('Supabase Key Role:', payload.role);
        console.log('Supabase Key Project Ref:', payload.ref);
        
        const urlRef = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
        if (urlRef && payload.ref !== urlRef) {
          console.error('CRITICAL: Supabase URL and Key Project Ref mismatch!', { urlRef, keyRef: payload.ref });
        }
      }
    } catch (e) {
      console.warn('Could not parse Supabase key as JWT');
    }

    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    console.log('Supabase client initialized successfully');
  } catch (err) {
    console.error('Supabase client initialization failed:', err);
    supabaseInstance = null;
  }
} else {
  console.warn('Supabase credentials missing or invalid in environment.', {
    urlLength: supabaseUrl?.length,
    keyLength: supabaseAnonKey?.length
  });
}

export const supabase = supabaseInstance;

if (!supabase) {
  console.warn('Supabase credentials missing or invalid. Realtime features will be disabled.');
}
