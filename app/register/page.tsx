
import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';

export default function Register() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto px-5 py-20">
          <p className="eyebrow">AUTHOR WORKSPACE</p>
          <h1 className="heading text-4xl mt-3">
            Loading registration...
          </h1>
        </div>
      }
    >
      <AuthForm mode="register" />
    </Suspense>
  );
}
