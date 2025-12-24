# Port 5055 Already in Use - Solution

## Problem
When running `npm run dev`, you may encounter:
```
Error: listen EADDRINUSE: address already in use :::5055
```

This happens when:
- A previous backend instance didn't shut down properly
- Multiple terminal windows are running the backend
- Nodemon restarted but the old process is still holding the port

## Solutions

### Quick Fix (Manual)
1. **Kill all node processes:**
   ```bash
   taskkill /F /IM node.exe
   ```

2. **Or kill specific port:**
   ```bash
   npm run kill-port
   ```

### Automatic Fix (Recommended)
The `dev` script now automatically kills any process using port 5055 before starting:
```bash
npm run dev
```

This runs `kill-port.js` first, then starts nodemon.

### Alternative: Use dev:safe
```bash
npm run dev:safe
```
Same as `dev` - automatically frees the port first.

## Prevention Tips
1. **Always stop the server properly:** Press `Ctrl+C` in the terminal running `npm run dev`
2. **Check before starting:** Run `npm run kill-port` if you're unsure
3. **Close unused terminals:** Don't leave multiple backend instances running

## Manual Port Check
To check what's using port 5055:
```bash
netstat -ano | findstr :5055
```

To kill a specific process:
```bash
taskkill /PID <process_id> /F
```

