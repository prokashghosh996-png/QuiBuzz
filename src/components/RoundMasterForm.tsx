import { useEffect, useState } from 'react';
import { roundMaster, type Quiz } from '../../shared/types';
import type { Act } from '../useQuiz';
import { Field } from './ui';
export function RoundMasterForm({
  quiz,
  act,
  busy,
  index,
}: {
  quiz: Quiz;
  act: Act;
  busy: boolean;
  index: number;
}) {
  const savedMaster = roundMaster(quiz, index);
  const [master, setMaster] = useState(savedMaster);
  useEffect(() => setMaster(savedMaster), [savedMaster]);
  return (
    <form
      className="round-master-form"
      onSubmit={(e) => {
        e.preventDefault();
        void act({ type: 'roundMaster', roundId: quiz.rounds[index].id, master });
      }}
    >
      <Field label={`Round ${index + 1} quiz master ? ${quiz.rounds[index].name}`}>
        <input
          value={master}
          required
          maxLength={100}
          onChange={(e) => setMaster(e.target.value)}
        />
      </Field>
      <button
        className="btn"
        disabled={busy || !master.trim() || master.trim() === roundMaster(quiz, index)}
      >
        Save QM
      </button>
    </form>
  );
}
