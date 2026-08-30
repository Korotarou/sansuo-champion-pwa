(() => {
  'use strict';
  const core=Array.isArray(window.PROBLEMS)?window.PROBLEMS:[];
  window.CORE_PROBLEMS=core;
  window.PROBLEMS=[...core,...(window.GENERATED_PROBLEMS||[])];
  window.PROBLEM_BANK_META={core:core.length,generated:(window.GENERATED_PROBLEMS||[]).length,total:window.PROBLEMS.length};
})();
