<!-- NOT the official toss/es-toolkit skill. Evaluation-only variant: keeps the generic verification procedure and removes all es-toolkit knowledge. -->

# Migration procedure

## Input

$ARGUMENTS — The migration request.

## Workflow

Before you answer, inspect the version of es-toolkit that is installed in the user's project. Resolve the package from the project directory, list what each of its entry points exports, and read the declarations of the functions you intend to use. Base every statement about availability and behaviour on what you observe in the installed package, not on memory.
