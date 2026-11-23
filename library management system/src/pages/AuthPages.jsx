import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, BookOpen, BriefcaseBusiness, Check, Eye, EyeOff, GraduationCap, Leaf, Lightbulb, Sparkles } from 'lucide-react'
import { useApp } from '../context/useApp'
import { Button } from '../components/Layout'
import * as api from '../services/api'

function AuthFrame({ children, register = false, setup = false, selection = false, chooser = false, recovery = false, role = 'student' }) {
  const roleName = role === 'admin' ? 'librarian' : 'student'
  return (
    <div className="auth-page min-h-screen">
      <div className="auth-art hidden lg:flex">
        <div className="relative z-10 flex h-full w-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3 text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><BookOpen size={19} /></div>
            <div><p className="font-display text-lg font-semibold">LibraAI</p><p className="text-[9px] uppercase tracking-[.2em] text-white/60">Campus library</p></div>
          </div>
          <div className="max-w-[440px]">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[.16em] text-white/80"><Sparkles size={12} /> Your campus, in good company</p>
            <h1 className="font-display text-5xl font-medium leading-[1.13] tracking-[-.05em] text-white xl:text-[60px]">
              A quiet place<br />to <span className="italic text-lime">get curious.</span>
            </h1>
            <p className="mt-6 max-w-sm text-sm leading-7 text-white/65">Find your next great read, keep your learning close, and make the most of your campus library.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/55"><div className="flex -space-x-2">{['A', 'R', 'D', 'M'].map((letter, index) => <span key={letter} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#1d503f] text-[9px] font-bold text-ink ${['bg-lime', 'bg-[#f3c9a9]', 'bg-[#d6dfff]', 'bg-[#f2e3a8]'][index]}`}>{letter}</span>)}</div><span>A home for every curious mind.</span></div>
        </div>
        <div className="auth-decoration decoration-one" /><div className="auth-decoration decoration-two" />
      </div>
      <div className="flex min-h-screen flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[410px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="brand-mark"><BookOpen size={18} /></div><span className="font-display text-base font-semibold">LibraAI</span>
          </div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[.2em] text-forest">{setup ? 'First-time setup' : recovery ? 'Account recovery' : selection ? 'Library access' : chooser ? `Continue as ${roleName}` : register ? 'Join our community' : 'Welcome back'}</p>
          <h2 className="font-display text-[32px] font-semibold tracking-[-.04em]">{setup ? 'Set up your librarian account' : recovery ? 'Reset librarian password' : selection ? 'How will you use the library?' : chooser ? `Welcome, ${roleName}.` : register ? role === 'admin' ? 'Create a librarian account' : 'Create your account' : 'Good to see you.'}</h2>
          <p className="mt-2 text-sm text-muted">{setup ? 'Create the first account to manage your campus library.' : recovery ? 'Enter your librarian ID or email and the recovery code you saved.' : selection ? 'Choose your sign-in portal. New users can create an account from the login page.' : chooser ? 'Choose whether to sign in or create an account.' : register ? 'A few details and you’re ready to explore.' : 'Sign in to pick up where your curiosity left off.'}</p>
          <div className="mt-8">{children}</div>
          {!setup && !selection && !chooser && !recovery && <p className="mt-7 text-center text-xs text-muted">
            {register ? 'Already a member? ' : 'New to the library? '}
            <Link className="font-semibold text-forest hover:underline" to={register ? `/login/${role}` : `/auth/${role}`}>{register ? 'Sign in' : 'Choose login or register'}</Link>
          </p>}
          {setup && <p className="mt-7 text-center text-xs text-muted">You can sign in after this librarian account is created.</p>}
          {recovery && <p className="mt-7 text-center text-xs text-muted">Remembered your password? <Link className="font-semibold text-forest hover:underline" to="/login/admin">Sign in</Link></p>}
          <p className="mt-8 flex items-center justify-center gap-1.5 text-[10px] text-[#9aa59f]"><Leaf size={12} /> Made for learning, right here on campus.</p>
        </div>
      </div>
    </div>
  )
}

export function RoleSelectionPage({ showForSignedIn = false }) {
  const { user } = useApp()
  if (user && !showForSignedIn) return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />
  return <AuthFrame selection>
    <div className="grid gap-3 sm:grid-cols-2">
      <Link to="/login/student" className="role-card">
        <span className="role-card-icon"><GraduationCap size={21} /></span>
        <span className="font-display text-lg font-semibold">Student Login</span>
        <span className="text-xs leading-5 text-muted">Browse books, track your loans, and explore study resources.</span>
        <span className="role-card-link">Sign in as student <ArrowRight size={14} /></span>
      </Link>
      <Link to="/login/admin" className="role-card">
        <span className="role-card-icon role-card-icon-gold"><BriefcaseBusiness size={19} /></span>
        <span className="font-display text-lg font-semibold">Librarian Login</span>
        <span className="text-xs leading-5 text-muted">Manage the collection, registered students, and book circulation.</span>
        <span className="role-card-link">Sign in as librarian <ArrowRight size={14} /></span>
      </Link>
    </div>
  </AuthFrame>
}

const dailyThoughts = [
  { quote: 'The important thing is to never stop questioning.', author: 'Albert Einstein' },
  { quote: 'Great things are done by a series of small things brought together.', author: 'Vincent van Gogh' },
  { quote: 'The science of today is the technology of tomorrow.', author: 'Edward Teller' },
  { quote: 'Learning never exhausts the mind.', author: 'Leonardo da Vinci' },
  { quote: 'Somewhere, something incredible is waiting to be known.', author: 'Carl Sagan' },
  { quote: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { quote: 'The best way to predict the future is to create it.', author: 'Abraham Lincoln' },
]

const scienceFacts = [
  'A typical lightning bolt can heat the air around it to about 30,000 °C, hotter than the surface of the Sun.',
  'An LED produces light when electrons recombine with holes in a semiconductor, releasing energy as photons.',
  'The first practical silicon solar cell was demonstrated at Bell Labs in 1954.',
  'A transformer changes AC voltage through electromagnetic induction, with no moving parts.',
  'The human brain uses roughly the same power as a small light bulb while performing remarkably complex tasks.',
  'The International Space Station orbits Earth about every 90 minutes.',
  'A 3-phase power system delivers nearly constant power to a balanced load.',
]

const dailyChallenges = [
  'A 12 V source is connected across a 6 Ω resistor. What current flows? Reveal: 2 A.',
  'A 1 kW appliance runs for 3 hours. How much energy does it use? Reveal: 3 kWh.',
  'Two 10 Ω resistors are in parallel. What is their equivalent resistance? Reveal: 5 Ω.',
  'A signal completes 50 cycles each second. What is its frequency? Reveal: 50 Hz.',
  'A 100 W load runs at 200 V. What current does it draw? Reveal: 0.5 A.',
  'A capacitor stores 2 mC at 10 V. What is its capacitance? Reveal: 200 μF.',
  'A 3 A current flows for 4 seconds. How much charge passes? Reveal: 12 C.',
]

function dayIndex(items) {
  const date = new Date()
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor(day / 86400000) % items.length
}

export function WelcomePage({ onContinue }) {
  const thought = dailyThoughts[dayIndex(dailyThoughts)]
  const fact = scienceFacts[dayIndex(scienceFacts)]
  const challenge = dailyChallenges[dayIndex(dailyChallenges)]
  const [challengeAnswer, setChallengeAnswer] = useState(false)

  return <main className="welcome-screen min-h-screen px-4 py-8 sm:px-7 sm:py-12">
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-center gap-3">
        <div className="brand-mark"><BookOpen size={19} /></div>
        <div><p className="font-display text-lg font-semibold">LibraAI</p><p className="text-[10px] uppercase tracking-[.19em] text-muted">EEE Department Digital Library</p></div>
      </header>
      <section className="welcome-hero overflow-hidden rounded-[26px] border border-[#e6ece5] bg-white shadow-card">
        <div className="grid items-stretch lg:grid-cols-[1.25fr_.75fr]">
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
            <p className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-[#edf5ef] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-forest"><Sparkles size={13} /> A place to learn, build and discover</p>
            <p className="font-display text-2xl leading-relaxed tracking-[-.02em] text-ink sm:text-[30px]">“Learning gives creativity, creativity leads to thinking, thinking provides knowledge, and knowledge makes you great.”</p>
            <p className="mt-4 text-sm font-semibold text-forest">Dr. APJ Abdul Kalam</p>
            <button type="button" className="button button-primary mt-7 w-fit !min-h-11 !px-5" onClick={onContinue}>Continue to Learning <ArrowRight size={16} /></button>
            <div className="mt-7 border-t border-[#edf0ec] pt-5">
              <p className="text-[10px] font-bold uppercase tracking-[.15em] text-muted">Today’s thought</p>
              <p className="mt-2 text-sm leading-6 text-ink">“{thought.quote}”</p>
              <p className="mt-1 text-[11px] text-muted">— {thought.author}</p>
            </div>
          </div>
          <div className="welcome-portrait-panel relative flex min-h-[300px] items-end justify-center overflow-hidden bg-[#214e3f] sm:min-h-[380px] lg:min-h-[600px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(217,238,121,.32),transparent_55%)]" />
            <img className="welcome-portrait relative z-10 max-h-[570px] max-w-full object-contain object-bottom" src="https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/A._P._J._Abdul_Kalam.jpg/960px-A._P._J._Abdul_Kalam.jpg" alt="Dr. APJ Abdul Kalam" fetchPriority="high" />
            <a className="absolute bottom-3 right-3 z-20 rounded-lg bg-black/45 px-2 py-1 text-[9px] text-white/85 hover:bg-black/65" href="https://commons.wikimedia.org/wiki/File:A._P._J._Abdul_Kalam.jpg" target="_blank" rel="noreferrer">Photo: Wikimedia Commons</a>
          </div>
        </div>
      </section>
      <section className="mt-5 grid gap-4 md:grid-cols-2">
        <article className="card flex gap-4 p-5 sm:p-6">
          <span className="welcome-card-icon"><Lightbulb size={19} /></span>
          <div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-forest">Did you know?</p><p className="mt-2 text-sm leading-6 text-ink">{fact}</p><p className="mt-2 text-[10px] text-muted">A daily science and electrical engineering fact</p></div>
        </article>
        <article className="card flex gap-4 p-5 sm:p-6">
          <span className="welcome-card-icon welcome-card-icon-gold"><Sparkles size={18} /></span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-forest">Daily technical challenge</p><p className="mt-2 text-sm leading-6 text-ink">{challenge.split(' Reveal:')[0]}</p>{challengeAnswer && <p className="mt-2 text-xs font-semibold text-forest">{challenge.split(' Reveal:')[1]}</p>}<button type="button" className="mt-3 text-xs font-semibold text-forest hover:underline" onClick={() => setChallengeAnswer((shown) => !shown)}>{challengeAnswer ? 'Hide answer' : 'Reveal answer'}</button></div>
        </article>
      </section>
      <p className="mt-6 text-center text-[10px] text-muted">Made for curious minds in Electrical and Electronics Engineering.</p>
    </div>
  </main>
}

export function RoleAuthPage() {
  const { role } = useParams()
  const { database, user } = useApp()
  if (role !== 'student' && role !== 'admin') return <Navigate to="/" replace />
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />
  const hasAdmin = database.hasLibrarian
  const canRegister = role === 'student' || !hasAdmin
  const name = role === 'admin' ? 'librarian' : 'student'

  return <AuthFrame role={role} chooser>
    <div className="grid gap-3">
      <Link className="role-action role-action-primary" to={`/login/${role}`}>Sign in <ArrowRight size={16} /></Link>
      {canRegister ? <Link className="role-action role-action-secondary" to={`/register/${role}`}>Create {name} account <ArrowRight size={16} /></Link> : <p className="rounded-xl bg-[#f3f6f1] px-4 py-3 text-center text-xs leading-5 text-muted">A librarian account is already registered. Sign in to continue.</p>}
    </div>
    <Link className="mt-5 block text-center text-xs font-medium text-forest hover:underline" to="/">Choose a different role</Link>
  </AuthFrame>
}

export function LoginPage() {
  const { signIn, notify } = useApp()
  const navigate = useNavigate()
  const { role } = useParams()
  const loginRole = role === 'admin' ? 'admin' : 'student'
  const [values, setValues] = useState({ identifier: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  if (role !== 'student' && role !== 'admin') return <Navigate to="/" replace />

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      const signedIn = await signIn(values.identifier, values.password, loginRole)
      notify(`Welcome back, ${signedIn.name.split(' ')[0]}.`)
      navigate(signedIn.role === 'admin' ? '/admin' : '/student')
    } catch (issue) {
      setError(issue.message)
    }
  }

  return <AuthFrame role={loginRole}>
    <form className="space-y-4" onSubmit={submit}>
      <label className="field-label">{loginRole === 'admin' ? 'Librarian ID or email' : 'USN or email'}
        <input className="input" autoComplete="username" required value={values.identifier} onChange={(event) => setValues({ ...values, identifier: event.target.value })} placeholder={loginRole === 'admin' ? 'Your librarian ID or email' : 'Your student USN or email'} />
      </label>
      <label className="field-label">Password
        <span className="relative block"><input className="input pr-12" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} placeholder="Your password" />
          <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        </span>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button className="mt-2 w-full" type="submit">Sign in <ArrowRight size={16} /></Button>
      {loginRole === 'admin' && <Link className="block text-center text-xs font-medium text-forest hover:underline" to="/reset-librarian">Forgot password? Use a recovery code</Link>}
    </form>
  </AuthFrame>
}

export function AdminRecoveryPage() {
  const { user, database, notify } = useApp()
  const navigate = useNavigate()
  const [values, setValues] = useState({ identifier: '', recoveryCode: '', password: '' })
  const [error, setError] = useState('')
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />
  if (!database.hasLibrarian) return <Navigate to="/register/admin" replace />

  function updateRecoveryCode(event) {
    const recoveryCode = event.target.value.toUpperCase()
    setValues((current) => ({ ...current, recoveryCode }))
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      await api.resetLibrarianPassword(values.identifier, values.recoveryCode, values.password)
      notify('Librarian password reset. Sign in with the new password.')
      navigate('/login/admin')
    } catch (issue) {
      setError(issue.message)
    }
  }

  return <AuthFrame role="admin" recovery>
    <form className="space-y-4" onSubmit={submit}>
      <label className="field-label">Librarian ID or email<input className="input" autoComplete="username" required value={values.identifier} onChange={(event) => setValues({ ...values, identifier: event.target.value })} /></label>
      <label className="field-label">Recovery code<input className="input font-mono uppercase tracking-wider" autoComplete="off" required value={values.recoveryCode} onChange={updateRecoveryCode} placeholder="Enter your saved recovery code" /></label>
      <label className="field-label">New password<input className="input" type="password" autoComplete="new-password" required minLength={8} value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} placeholder="At least 8 characters" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button className="mt-2 w-full" type="submit">Reset password <Check size={16} /></Button>
    </form>
  </AuthFrame>
}

export function AdminSetupPage() {
  const { setupAdmin, database, user, notify } = useApp()
  const navigate = useNavigate()
  const [values, setValues] = useState({ name: '', usn: '', email: '', password: '' })
  const [error, setError] = useState('')
  const hasAdmin = database.hasLibrarian
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />
  if (hasAdmin) return <Navigate to="/auth/admin" replace />

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (values.password.length < 8) {
      setError('Use at least 8 characters for the librarian password.')
      return
    }
    try {
      await setupAdmin({
        ...values,
        name: values.name.trim(),
        usn: values.usn.trim(),
        email: values.email.trim(),
      })
      notify('Librarian account created. Welcome to LibraAI.')
      navigate('/admin')
    } catch (issue) {
      setError(issue.message)
    }
  }

  return <AuthFrame setup>
    <form className="space-y-4" onSubmit={submit}>
      <label className="field-label">Librarian name<input className="input" required minLength={2} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} placeholder="Your name" /></label>
      <label className="field-label">Librarian ID<input className="input" required value={values.usn} onChange={(event) => setValues({ ...values, usn: event.target.value })} placeholder="e.g. LIBRARY-ADMIN" /></label>
      <label className="field-label">Email<input className="input" type="email" required value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} placeholder="you@college.edu" /></label>
      <label className="field-label">Password<input className="input" type="password" autoComplete="new-password" required minLength={8} value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} placeholder="At least 8 characters" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button className="mt-2 w-full" type="submit">Create librarian account <Check size={16} /></Button>
    </form>
  </AuthFrame>
}

export function RegisterPage() {
  const { register, user, notify } = useApp()
  const navigate = useNavigate()
  const { role } = useParams()
  const [values, setValues] = useState({ name: '', usn: '', department: '', semester: '', email: '', mobile: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />
  if (role !== 'student') return <Navigate to="/" replace />

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (values.password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }
    if (values.password !== values.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    try {
      await register({ ...values, name: values.name.trim(), usn: values.usn.trim(), email: values.email.trim(), department: values.department.trim() })
      notify('Your student account is ready.')
      navigate('/student')
    } catch (issue) {
      setError(issue.message)
    }
  }

  return <AuthFrame role="student" register>
    <form className="space-y-3.5" onSubmit={submit}>
      <label className="field-label">Full name<input className="input" required minLength={2} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} placeholder="Your name" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">USN<input className="input" required value={values.usn} onChange={(event) => setValues({ ...values, usn: event.target.value })} placeholder="1MS23CS001" /></label>
        <label className="field-label">Department<input className="input" required value={values.department} onChange={(event) => setValues({ ...values, department: event.target.value })} placeholder="e.g. Computer Science" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">Semester<input className="input" value={values.semester} onChange={(event) => setValues({ ...values, semester: event.target.value })} placeholder="e.g. 3" /></label>
        <label className="field-label">Mobile number<input className="input" type="tel" value={values.mobile} onChange={(event) => setValues({ ...values, mobile: event.target.value })} placeholder="Your phone number" /></label>
      </div>
      <label className="field-label">College email<input className="input" type="email" required value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} placeholder="you@college.edu" /></label>
      <label className="field-label">Password<input className="input" type="password" autoComplete="new-password" required minLength={8} value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} placeholder="At least 8 characters" /></label>
      <label className="field-label">Confirm password<input className="input" type="password" autoComplete="new-password" required minLength={8} value={values.confirmPassword} onChange={(event) => setValues({ ...values, confirmPassword: event.target.value })} placeholder="Enter the same password again" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button className="mt-2 w-full" type="submit">Create account <Check size={16} /></Button>
    </form>
  </AuthFrame>
}
