<!-- NOT the official toss/es-toolkit skill. Evaluation-only variant: same name, frontmatter and similar length, but only general advice with no es-toolkit knowledge. -->

# General Migration Advice

General guidance for changing a dependency in an existing codebase. It applies to any library swap and does not describe any particular library.

## Input

$ARGUMENTS — The migration request.

## Why a steady process matters

Dependency migrations fail less often because of the new library and more often because the change was too large to review, was mixed with unrelated edits, or was merged without anyone confirming that the application still behaves the same. A steady process keeps each step small enough to understand and easy to undo.

## Workflow

### 1. Understand the request

Read the request and restate it to yourself in one sentence. Identify which files are in scope and which are not. If the request names a single file, stay inside that file.

### 2. Look at the surrounding code

Open the file and read it from top to bottom before editing. Note the public interface that other modules rely on, the naming conventions in use, and the formatting style. A migration should leave these as they were.

### 3. Make one change at a time

Prefer a sequence of small edits over one large rewrite. After each edit the file should still be in a state that could be committed. Avoid reformatting lines you did not need to touch, because unrelated whitespace changes make the diff harder to review.

### 4. Keep the public interface stable

Callers should not need to change. Keep exported names, parameter order, and return shapes as they are unless the request explicitly asks for an interface change.

### 5. Run the checks the project already has

Use the project's existing scripts for type checking, linting, and tests. Run them before you start so you know the baseline, and again after your change. If a check was already failing before your change, say so rather than hiding it.

### 6. Write down what you did

Summarize the change in plain language: what was replaced, what was left alone and why, and anything a reviewer should look at closely. Mention any assumption you made. A short, accurate summary is more useful than a long one.

## Working habits

| Habit                    | Why it helps                                      |
| ------------------------ | ------------------------------------------------- |
| Small, focused commits   | Each step can be reviewed and reverted on its own |
| Stable public interface  | Callers keep working without coordinated changes  |
| Checks before and after  | Regressions are attributed to the right change    |
| No drive-by reformatting | The diff shows only what the migration needed     |
| Plain-language summary   | Reviewers know where to focus                     |

## Communication

- State what you changed and what you verified.
- Separate facts you observed from things you are assuming.
- If something could not be completed, say what is left and why.
- Keep the tone factual. Do not describe the result as better than it is.

## When the request is broad

If the request covers many files, propose an order: start with leaf modules that few others depend on, then move toward shared modules. Suggest that each group of files be reviewed separately. For very large codebases, mention that automated transforms and lint rules can keep the old usage from coming back, without prescribing a specific tool.

## Closing

End with a brief recap of the change and the checks that were run.
