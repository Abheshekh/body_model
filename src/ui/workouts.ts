// Workouts page (R7): the working Programs entry and what is coming.
export function mountWorkouts(root: HTMLElement): void {
  root.innerHTML = `
    <div class="page-in">
      <h1>Workouts</h1>
      <ul class="program-list">
        <li><a class="program-row" href="#workouts/programs"><span class="item-name">Programs</span><span class="muted">Exercises by goal</span></a></li>
      </ul>
      <h2>Coming</h2>
      <ul class="program-list coming">
        <li class="program-row"><span class="item-name">Exercise library</span><span class="muted">R5</span></li>
        <li class="program-row"><span class="item-name">Task builder</span><span class="muted">R5</span></li>
        <li class="program-row"><span class="item-name">Move</span><span class="muted">R3</span></li>
      </ul>
    </div>`;
}
