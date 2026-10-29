/* The left half of the sign-in screens (App.jsx: find, login, forgot,
   reset, change-password, signup). On a computer it sits beside the form
   card: a short headline for the screen and an animated isometric picture
   of a boutique (public/auth-boutique.svg: a fabric shelf being filled, a
   sewing machine at work, an order ready to go), with a caption under it
   that follows the picture's 9-second loop. Tablets and phones keep the
   card on its own and show only the caption, under it (auth.css). Purely
   visual: nothing here touches the forms or their state. */
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import './auth.css';

const COPY = {
  login: {
    eyebrow: 'Welcome back',
    title: 'Sign in to your boutique',
    line: 'Orders, measurements, your workshop and your fabrics, right where you left them.',
  },
  find: {
    eyebrow: "Your boutique's own address",
    title: 'Every boutique has its own door',
    line: "Type your boutique's name and we will take you straight to its sign-in.",
  },
  notfound: {
    eyebrow: 'Address not found',
    title: "Let's find the right door",
    line: 'Check the spelling with your boutique, or ask for a boutique of your own.',
  },
  help: {
    eyebrow: 'Account help',
    title: 'Back to work in a minute',
    line: 'Choose a new password and carry on. Your orders and your data stay just as they are.',
  },
  password: {
    eyebrow: 'First sign-in',
    title: 'One last step',
    line: 'Choose your own password and your workspace opens.',
  },
  signup: {
    eyebrow: 'Request access',
    title: 'Tell us about your boutique',
    line: 'Our team reviews every request and emails you your login details.',
    points: [
      'Orders, measurements and the workshop in one place',
      'Nothing to install: it runs in the browser, on a phone or a laptop',
      'Your tailors and masters sign in from their own phones',
    ],
  },
};

// The caption, in step with the picture: the new fabric lands on the shelf,
// the machine stitches, the order is ready (3 x 3s = its 9s loop).
const STEPS = [
  'New silk arrives on the shelf',
  'Stitching in progress · bridal blouse',
  'Order ready for Priya',
];

function useStep(active) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 3000);
    return () => clearInterval(timer);
  }, [active]);
  return step;
}

export default function AuthShowcase({ kind = 'login' }) {
  const copy = COPY[kind] || COPY.login;
  const withScene = !copy.points;
  const step = useStep(withScene);
  return (
    <aside className={`auth-show auth-show--${kind}`} aria-label="Scaleezy">
      <div className="auth-show-text">
        <img className="auth-show-logo" src="/scaleezy-wordmark-dark.webp" alt="Scaleezy" />
        <span className="auth-show-eyebrow">{copy.eyebrow}</span>
        <h1 className="auth-show-title">{copy.title}</h1>
        <p className="auth-show-line">{copy.line}</p>
        {copy.points && (
          <ul className="auth-show-points">
            {copy.points.map((p) => (
              <li key={p}><span className="auth-show-check"><Check size={13} strokeWidth={3} /></span>{p}</li>
            ))}
          </ul>
        )}
      </div>
      {withScene && (
        <>
          <img className="auth-show-art" src="/auth-boutique.svg" alt="" aria-hidden="true" draggable="false" />
          <p className="auth-show-caption"><span className="auth-show-dot" aria-hidden="true" /><span key={step}>{STEPS[step]}</span></p>
        </>
      )}
    </aside>
  );
}
