<!-- Evaluation-only placebo. Not the official toss/es-toolkit skill. -->

# Careful Dependency Change Guide

General guidance for replacing one dependency with another in an existing codebase. It applies to any library swap and does not describe any particular library.

## Input

$ARGUMENTS — The change request.

## Why a careful change matters

Dependency changes rarely fail because of the new library itself. They fail because the change was too large to review, was mixed with unrelated edits, or quietly altered an interface that other modules relied on. A careful change keeps each step small enough to understand, easy to explain, and easy to undo.

The goal of this guide is not speed. The goal is a change that a teammate can read once and trust.

## Workflow

### 1. Restate the request

Read the request and restate it to yourself in one sentence. Identify which files are in scope and which are not. If the request names a single file, stay inside that file. If the request is ambiguous about scope, choose the narrower reading and mention the choice in your summary.

### 2. Read the file before editing

Read the file from top to bottom before changing anything. Note the public interface that other modules rely on, the naming conventions in use, the order of declarations, and the formatting style. A dependency change should leave these as they were, so that the diff shows only what the change required.

Pay attention to comments. Comments often record why a line looks the way it does. Keep comments that still describe the code, and update comments whose meaning the change affects.

### 3. Plan the edits

Before editing, list the places in the file that refer to the old dependency. Group them by the kind of change each one needs. A short plan written in your head or in a scratch note makes it less likely that one usage is forgotten and more likely that similar usages are changed in the same way.

### 4. Make one change at a time

Prefer a sequence of small edits over one large rewrite. Change one usage, then the next. Avoid reformatting lines you did not need to touch, because unrelated whitespace changes make the diff harder to review and hide the lines that matter.

Keep the shape of each expression close to the original when you can. A reviewer reads a diff faster when the before and after line up.

### 5. Keep the public interface stable

Callers should not need to change. Keep exported names, parameter names and order, optional parameters, and return shapes as they are unless the request explicitly asks for an interface change. If an internal helper becomes unused, remove it only when it is not exported.

### 6. Keep types honest

Do not widen a type to make an edit compile, and do not add type assertions that hide a real mismatch. If a type has to change, change it in one place and keep the change visible in the diff. Prefer explicit types on exported functions so that the interface stays readable.

### 7. Write down what you did

Summarize the change in plain language: what was replaced, what was left alone and why, and anything a reviewer should look at closely. Mention every assumption you made. A short, accurate summary is more useful than a long one.

## Working habits

| Habit                    | Why it helps                                          |
| ------------------------ | ----------------------------------------------------- |
| Small, focused edits     | Each step can be reviewed and reverted on its own     |
| Stable public interface  | Callers keep working without coordinated changes      |
| Honest types             | Type errors point at real problems instead of noise   |
| No drive-by reformatting | The diff shows only what the change needed            |
| Comments kept accurate   | Future readers understand why the code looks this way |
| Plain-language summary   | Reviewers know where to focus                         |

## Naming and style

- Keep the existing naming style. If the file uses camelCase for functions, keep camelCase.
- Keep import statements grouped and ordered the way the file already groups them.
- Prefer one import statement per source module.
- Do not rename local variables unless the change requires it.
- Keep line length and quote style consistent with the rest of the file.

## Communication

- State what you changed.
- Separate facts you observed from things you are assuming.
- If something could not be completed, say what is left and why.
- Keep the tone factual. Do not describe the result as better than it is.
- If you made a judgement call, give the reason in one sentence.

## When the request is broad

If the request covers many files, propose an order: start with leaf modules that few others depend on, then move toward shared modules. Suggest that each group of files be reviewed separately, so that a problem in one group does not block the others. For very large codebases, mention that the change can be split across several pull requests, each with its own summary.

## Common mistakes to avoid

- Mixing the dependency change with an unrelated refactor.
- Changing exported names or signatures without being asked.
- Removing comments that still explain the code.
- Leaving half-changed usages, where some lines use the old dependency and similar lines use the new one without a stated reason.
- Writing a summary that claims more than the change does.

## Review checklist

Before you finish, read your own diff once as a reviewer would:

1. Is every edited line needed for the change?
2. Are exported names and signatures unchanged?
3. Are similar usages changed in the same way?
4. Do comments still match the code?
5. Does the summary describe the change accurately?

## Closing

End with a brief recap of the change and any assumptions a reviewer should know about.
