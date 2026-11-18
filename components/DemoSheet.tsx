const DIES = [
  ["die-1", "mark-dot"],
  ["die-2", "mark-ring"],
  ["die-3", "mark-bar"],
  ["die-4", "mark-dot"],
  ["die-5", "mark-ring"],
  ["die-6", "mark-bar"],
] as const;

export function DemoSheet({ look = "photo" }: { look?: string }) {
  return (
    <div className="demo-sheet" data-look={look} aria-hidden="true">
      {DIES.map(([die, mark]) => (
        <span key={die} className={`die ${die}`}>
          <span className={`mark ${mark}`} />
        </span>
      ))}
    </div>
  );
}
