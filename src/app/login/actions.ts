'use server';import {redirect} from 'next/navigation';import {createClient} from '@/utils/supabase/server';
export async function login(f:FormData){const s=await createClient();const {error}=await s.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('password'))});if(error)redirect('/login?error=1');redirect('/')}
