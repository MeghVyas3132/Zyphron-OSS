import { redirect } from 'next/navigation';

export default function NewDatabaseRedirectPage() {
  redirect('/databases?new=1');
}

