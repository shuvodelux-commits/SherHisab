import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { login } from './auth-api'

interface LoginPageProps {
  onAuthenticated: () => Promise<void> | void
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [tenantSlug, setTenantSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await login({
        tenantSlug: tenantSlug.trim(),
        email: email.trim(),
        password,
      })
      await onAuthenticated()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to sign in. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand" aria-hidden="true">
          S
        </div>

        <header className="auth-heading">
          <h1 id="auth-title">Sign in to SherHisab</h1>
          <p>Use your business account to continue.</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Business code</span>
            <Input
              autoComplete="organization"
              onChange={(event) => setTenantSlug(event.target.value)}
              required
              value={tenantSlug}
            />
          </label>

          <label className="auth-field">
            <span>Email</span>
            <Input
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <Input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <div className="auth-error" role="alert">
              {error}
            </div>
          ) : null}

          <Button
            className="auth-submit"
            disabled={submitting}
            type="submit"
            variant="default"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </section>
    </main>
  )
}
