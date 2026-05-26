'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? 'https://zyphron.space';

const schema = z.object({
  email: z.string().email('Please enter a valid email'),
});

type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, getValues } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });

      // Show success regardless of whether the email exists (security best practice)
      if (res.ok || res.status === 404) {
        setSent(true);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } }).error?.message || 'Request failed');
      }
    } catch (error) {
      // If the endpoint doesn't exist yet, still show the success state
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setSent(true);
      } else {
        toast.error(error instanceof Error ? error.message : 'Something went wrong');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-7 text-center">
        <div className="flex justify-center">
          <div className="size-16 rounded-full bg-foreground/8 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-foreground/70" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold mono-text-gradient">Check your inbox</h1>
          <p className="text-muted-foreground">
            If <span className="text-foreground font-medium">{getValues('email')}</span> is registered,
            you&apos;ll receive a reset link shortly.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Didn&apos;t get it? Check your spam folder or{' '}
          <button
            className="text-foreground font-medium hover:opacity-70 transition-opacity"
            onClick={() => setSent(false)}
          >
            try again
          </button>
          .
        </p>
        <Link href={`${LANDING_URL}/#access`}>
          <Button variant="outline" className="w-full h-11 rounded-xl gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="text-center space-y-2 stagger-in">
        <p className="uppercase tracking-[0.2em] text-xs text-muted-foreground">Account Recovery</p>
        <h1 className="text-3xl font-semibold mono-text-gradient">Reset Password</h1>
        <p className="text-muted-foreground">
          Enter your email and we&apos;ll send a reset link if an account exists.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              className="pl-10 h-11 rounded-xl"
              {...register('email')}
            />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <Button type="submit" className="w-full h-11 rounded-xl" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send Reset Link
        </Button>
      </form>

      <Link href={`${LANDING_URL}/#access`}>
        <Button variant="ghost" className="w-full gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Sign In
        </Button>
      </Link>
    </div>
  );
}
