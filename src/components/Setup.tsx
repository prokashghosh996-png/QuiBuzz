import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flag,
  Users,
  SlidersHorizontal,
  ClipboardCheck,
  UserRound,
  Save,
  Play,
} from 'lucide-react';
import { type Draft, type Quiz, teamLetter } from '../../shared/types';
import { readySchema } from '../../shared/validation';
import type { Act } from '../useQuiz';
import { Field, PageHeader, BackHome } from './ui';
const steps = ['Quiz details', 'Teams', 'Quiz master', 'Rounds', 'Scoring', 'Review'];
const icons = [Flag, Users, UserRound, Flag, SlidersHorizontal, ClipboardCheck];
export function Setup({ quiz, act, busy }: { quiz: Quiz; act: Act; busy: boolean }) {
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const cache = JSON.parse(localStorage.getItem(`draft:${quiz.id}`) || 'null');
      return cache?.baseVersion === quiz.version ? cache.draft : quiz.draft;
    } catch {
      return quiz.draft;
    }
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(true);
  const [validation, setValidation] = useState('');
  const ref = useRef(draft);
  ref.current = draft;
  const [step, setStep] = useState(draft.step);
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    if (dirty)
      localStorage.setItem(
        `draft:${quiz.id}`,
        JSON.stringify({ baseVersion: quiz.version, draft: ref.current }),
      );
  }, [quiz.version, quiz.id, dirty]);
  const update = (next: Draft) => {
    setDraft(next);
    setDirty(true);
    setSaved(false);
    localStorage.setItem(
      `draft:${quiz.id}`,
      JSON.stringify({ baseVersion: quiz.version, draft: next }),
    );
  };
  useEffect(() => {
    if (!dirty || busy) return;
    const timer = setTimeout(async () => {
      const snapshot = ref.current;
      if (await actRef.current({ type: 'saveDraft', draft: snapshot })) {
        if (ref.current === snapshot) {
          setDirty(false);
          setSaved(true);
          localStorage.removeItem(`draft:${quiz.id}`);
        }
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [draft, dirty, busy, quiz.id]);
  const resize = <T,>(items: T[], count: number, make: () => T) =>
    Array.from({ length: count }, (_, i) => items[i] ?? make());
  const number = (value: string, min = 1, max = 100) =>
    Math.min(max, Math.max(min, Number(value) || min));
  const checkStep = () => {
    if (step === 0 && !draft.name.trim()) return 'Give your quiz a name to continue.';
    if (step === 1 && draft.teams.some((t) => t.members.some((m) => !m.trim())))
      return 'Enter a name for every team member.';
    if (step === 2 && !draft.master.trim()) return 'Enter the quiz master’s name.';
    if (step === 3 && draft.rounds.some((r) => !r.name.trim())) return 'Give every round a name.';
    return '';
  };
  const move = async (next: number) => {
    if (next > step) {
      const err = checkStep();
      if (err) {
        setValidation(err);
        return;
      }
    }
    setValidation('');
    const nextDraft = { ...draft, step: next };
    update(nextDraft);
    setStep(next);
    if (next === 5) {
      const result = readySchema.safeParse(nextDraft);
      if (!result.success) {
        setValidation(result.error.issues.map((i) => i.message).join(' '));
        return;
      }
      if (await act({ type: 'ready', draft: nextDraft })) {
        setDirty(false);
        setSaved(true);
        localStorage.removeItem(`draft:${quiz.id}`);
      }
    }
  };
  const start = async () => {
    const result = readySchema.safeParse(draft);
    if (!result.success) {
      setValidation(result.error.issues.map((i) => i.message).join(' '));
      return;
    }
    if (quiz.status !== 'READY' || dirty) {
      if (!(await act({ type: 'ready', draft }))) return;
      setDirty(false);
    }
    if (await act({ type: 'start' })) localStorage.removeItem(`draft:${quiz.id}`);
  };
  return (
    <main className="page setup-page">
      <BackHome />
      <PageHeader title="Set the stage." subtitle="A little preparation. A seamless final round." />
      <div className="setup-layout">
        <aside className="setup-steps">
          {steps.map((name, i) => {
            const Icon = icons[i];
            return (
              <button
                key={name}
                disabled={busy || i > step + 1}
                onClick={() => void move(i)}
                className={`setup-step ${step === i ? 'active' : ''}`}
              >
                <span className="step-icon">
                  {i < step ? <Check size={18} /> : <Icon size={18} />}
                </span>
                <span>
                  <small>STEP {i + 1}</small>
                  {name}
                </span>
                {i < step && <Check size={15} className="green" />}
              </button>
            );
          })}
          <div className="setup-tip">
            <Save size={20} />
            <strong>Room for a change of plan.</strong>
            <p>Go back at any time. Your setup is saved as you work.</p>
          </div>
        </aside>
        <section className="panel setup-content">
          <div className="section-heading">
            <div>
              <p className="eyebrow">STEP {step + 1} OF 6</p>
              <h2>
                {
                  [
                    'Let’s make it official.',
                    'Meet the finalists.',
                    'Who’s running the show?',
                    'Build your rounds.',
                    'Every point counts.',
                    'Ready for the spotlight?',
                  ][step]
                }
              </h2>
              <p className="muted">
                {
                  [
                    'Start with the essentials for your competition.',
                    'Team names are optional. Great teammates aren’t.',
                    'The name shown on your quiz and result exports.',
                    'Set a name and question count for each round.',
                    'Simple rules, applied consistently to every team.',
                    'One last look before the first question.',
                  ][step]
                }
              </p>
            </div>
          </div>
          {step === 0 && (
            <div className="form-stack">
              <Field label="Quiz name">
                <input
                  value={draft.name}
                  maxLength={160}
                  placeholder="e.g. CodeSphere Tech Quiz 2026"
                  onChange={(e) => update({ ...draft, name: e.target.value })}
                  autoFocus
                />
              </Field>
              <div className="form-grid">
                <Field label="Number of teams" hint="At least 2 finalists">
                  <input
                    type="number"
                    min={2}
                    max={100}
                    value={draft.teams.length}
                    onChange={(e) =>
                      update({
                        ...draft,
                        teams: resize(draft.teams, number(e.target.value, 2), () => ({
                          name: '',
                          members: [''],
                        })),
                      })
                    }
                  />
                </Field>
                <Field label="Number of rounds">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={draft.rounds.length}
                    onChange={(e) =>
                      update({
                        ...draft,
                        rounds: resize(draft.rounds, number(e.target.value), () => ({
                          name: '',
                          questions: 10,
                        })),
                      })
                    }
                  />
                </Field>
              </div>
              <div className="info-box">
                <Flag size={20} />
                <p>
                  Designed for the final round.
                  <br />
                  <span>Keep the questions on stage. We’ll take care of the scores.</span>
                </p>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="form-stack">
              {draft.teams.map((t, i) => (
                <div className="setup-team" key={i}>
                  <div className="section-heading">
                    <h3>
                      <span className={`avatar color-${i % 6}`}>{teamLetter(i)}</span>Team{' '}
                      {teamLetter(i)}
                    </h3>
                    <Field label="Members">
                      <input
                        aria-label={`Team ${teamLetter(i)} member count`}
                        className="small-input"
                        type="number"
                        min={1}
                        max={100}
                        value={t.members.length}
                        onChange={(e) =>
                          update({
                            ...draft,
                            teams: draft.teams.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    members: resize(x.members, number(e.target.value), () => ''),
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Team name · optional">
                    <input
                      value={t.name}
                      maxLength={100}
                      placeholder={`Team ${teamLetter(i)}`}
                      onChange={(e) =>
                        update({
                          ...draft,
                          teams: draft.teams.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <div className="form-grid member-fields">
                    {t.members.map((m, k) => (
                      <Field key={k} label={`Member ${k + 1}`}>
                        <input
                          value={m}
                          maxLength={100}
                          required
                          onChange={(e) =>
                            update({
                              ...draft,
                              teams: draft.teams.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      members: x.members.map((v, l) =>
                                        l === k ? e.target.value : v,
                                      ),
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="form-stack">
              <Field label="Quiz master name">
                <input
                  value={draft.master}
                  maxLength={100}
                  placeholder="Full name"
                  onChange={(e) => update({ ...draft, master: e.target.value })}
                  autoFocus
                />
              </Field>
              <div className="info-box">
                <UserRound size={22} />
                <p>
                  The control room is yours.
                  <br />
                  <span>Direct, bonus, pounce — every decision stays in your hands.</span>
                </p>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="form-stack">
              {draft.rounds.map((r, i) => (
                <div key={i} className="round-form">
                  <span className="round-number">{String(i + 1).padStart(2, '0')}</span>
                  <Field label="Round name">
                    <input
                      value={r.name}
                      maxLength={100}
                      onChange={(e) =>
                        update({
                          ...draft,
                          rounds: draft.rounds.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label={`Round ${i + 1} quiz master`}>
                    <input
                      value={r.master ?? ''}
                      maxLength={100}
                      placeholder={draft.master}
                      onChange={(e) =>
                        update({
                          ...draft,
                          rounds: draft.rounds.map((x, j) =>
                            j === i ? { ...x, master: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Questions">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={r.questions}
                      onChange={(e) =>
                        update({
                          ...draft,
                          rounds: draft.rounds.map((x, j) =>
                            j === i ? { ...x, questions: number(e.target.value, 1, 1000) } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
          )}
          {step === 4 && (
            <div className="form-stack">
              <div className="form-grid">
                <Field label="Correct marks" hint="Awarded for direct, bonus and correct pounce">
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={draft.positive}
                    onChange={(e) =>
                      update({ ...draft, positive: number(e.target.value, 1, 10000) })
                    }
                  />
                </Field>
                <Field
                  label="Negative penalty"
                  hint="Enter a positive number; we deduct it automatically"
                >
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={draft.negative}
                    onChange={(e) =>
                      update({ ...draft, negative: number(e.target.value, 0, 10000) })
                    }
                  />
                </Field>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.bounceEnabled ?? true}
                  onChange={(e) => update({ ...draft, bounceEnabled: e.target.checked })}
                />
                Bounce rotation: next question follows the Direct or Bonus scorer
              </label>
              <Field label="Pounce time · seconds">
                <input
                  type="number"
                  min={1}
                  max={3600}
                  value={draft.pounceSeconds}
                  onChange={(e) =>
                    update({ ...draft, pounceSeconds: number(e.target.value, 1, 3600) })
                  }
                />
              </Field>
              <div className="scoring-preview">
                <span>
                  Direct <b>+{draft.positive}</b>
                </span>
                <span>
                  Bonus <b>+{draft.positive}</b>
                </span>
                <span>
                  Pounce <b>+{draft.positive}</b>
                </span>
                <span>
                  Pounce <b>−{draft.negative}</b>
                </span>
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="review">
              <div className="review-hero">
                <span className="badge">FINAL ROUND</span>
                <h2>{draft.name}</h2>
                <p>Hosted by {draft.master}</p>
                <div className="review-stats">
                  <span>
                    <b>{draft.teams.length}</b> teams
                  </span>
                  <span>
                    <b>{draft.rounds.length}</b> rounds
                  </span>
                  <span>
                    <b>
                      +{draft.positive} / −{draft.negative}
                    </b>{' '}
                    scoring
                  </span>
                  <span>
                    <b>{draft.pounceSeconds}s</b> pounce
                  </span>
                </div>
              </div>
              <h3>The rounds</h3>
              {draft.rounds.map((r, i) => (
                <div className="review-line" key={i}>
                  <span>
                    {i + 1}. {r.name}
                    <small>Quiz master: {r.master?.trim() || draft.master}</small>
                  </span>
                  <span>{r.questions} questions</span>
                </div>
              ))}
              <h3>The finalists</h3>
              {draft.teams.map((t, i) => (
                <div className="review-line" key={i}>
                  <div>
                    <strong>
                      Team {teamLetter(i)}
                      {t.name && ` — ${t.name}`}
                    </strong>
                    <small>{t.members.join(' · ')}</small>
                  </div>
                  <Users size={16} />
                </div>
              ))}
            </div>
          )}
          {validation && (
            <div className="error-banner" role="alert">
              {validation}
            </div>
          )}
          <footer className="setup-footer">
            <button
              className="btn"
              disabled={step === 0 || busy}
              onClick={() => void move(step - 1)}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <span className="save-label">
              <span className={`status-dot ${saved ? '' : 'amber'}`} />
              {saved ? 'Setup saved' : 'Saving setup…'}
            </span>
            {step < 5 ? (
              <button className="btn primary" disabled={busy} onClick={() => void move(step + 1)}>
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button className="btn primary" disabled={busy} onClick={() => void start()}>
                <Play size={16} /> Start quiz
              </button>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}
