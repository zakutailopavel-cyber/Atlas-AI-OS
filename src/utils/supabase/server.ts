import {createServerClient} from '@supabase/ssr';import {cookies} from 'next/headers';
export async function createClient(){const c=await cookies();return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>c.getAll(),setAll(v){try{v.forEach(x=>c.set(x.name,x.value,x.options))}catch{}}}})}
