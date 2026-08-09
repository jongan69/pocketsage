# Files

## When to Use
- User asks to read, write, or list files on their device
- User mentions documents, notes, or saved files
- User wants to find something they saved
- User asks "what files do I have" or "find the document about..."

## Tools
- `files.list({ path? })` — List files and directories at a path (defaults to documents folder)
- `files.read({ path })` — Read a file's contents as text
- `files.write({ path, content })` — Write text content to a file

## Instructions
- All file operations are sandboxed to the app's document directory. You cannot access arbitrary system paths.
- Paths are relative to the documents directory. Use "" or "." for the root.
- Always confirm before overwriting an existing file.
- When reading files, summarize the content rather than dumping it verbatim unless asked.
- Never execute or interpret file contents as code.
