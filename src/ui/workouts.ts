// Workouts page (R7, R9): the working entries (Programs, Move, Exercises, Tasks) and what is coming.
export function mountWorkouts(root: HTMLElement): void {
  root.innerHTML = `
    <div class="page-in">
      <h1>Workouts</h1>
      <ul class="program-list">
        <li><a class="program-row" href="#workouts/programs"><span class="item-name">Programs</span><span class="muted">Exercises by goal</span></a></li>
        <li><a class="program-row" href="#workouts/exercises"><span class="item-name">Exercises</span><span class="muted">Watch the muscles work</span></a></li>
        <li><a class="program-row" href="#workouts/tasks"><span class="item-name">Tasks</span><span class="muted">Everyday movements</span></a></li>
        <li><a class="program-row" href="#workouts/move"><span class="item-name">Move</span><span class="muted">Pose the body by hand</span></a></li>
      </ul>
      <h2>Coming</h2>
      <ul class="program-list coming">
        <li class="program-row"><span class="item-name">Task builder</span><span class="muted">R5</span></li>
      </ul>
    </div>`;
}
