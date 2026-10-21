import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    // Próbujemy pobrać listę z tabeli rooms z naszej bazy Supabase
    const { data, error } = await supabase.from('rooms').select('*');

    if (error) {
      return NextResponse.json({ sukces: false, blad: error.message }, { status: 400 });
    }

    return NextResponse.json({
      sukces: true,
      komunikat: 'Połączenie z bazą Supabase (PostgreSQL) działa poprawnie!',
      liczba_pokojow_w_bazie: data.length,
      dane: data,
    });
  } catch (err: any) {
    return NextResponse.json({ sukces: false, wyjatek: err.message }, { status: 500 });
  }
}