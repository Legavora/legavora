import {createBrowserClient,createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
export function browserDb(){return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)}
export async function serverDb(){const store=await cookies();return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll(){return store.getAll()},setAll(items){try{items.forEach(({name,value,options})=>store.set(name,value,options))}catch{}}}})}
export async function currentUser(){const db=await serverDb();const {data:{user}}=await db.auth.getUser();return {db,user}}
export async function requireUser(){const {db,user}=await currentUser();if(!user)throw new Error('Unauthorized');return {db,user}}
