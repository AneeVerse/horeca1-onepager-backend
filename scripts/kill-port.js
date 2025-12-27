const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const PORT = 5055;

async function killPort() {
  try {
    // Windows command to find and kill process on port
    const { stdout } = await execPromise(
      `netstat -ano | findstr :${PORT}`
    );
    
    if (stdout) {
      const lines = stdout.trim().split('\n');
      const pids = new Set();
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          pids.add(pid);
        }
      });
      
      if (pids.size > 0) {
        console.log(`Found ${pids.size} process(es) using port ${PORT}`);
        for (const pid of pids) {
          try {
            await execPromise(`taskkill /PID ${pid} /F`);
            console.log(`Killed process ${pid}`);
          } catch (err) {
            console.log(`Could not kill process ${pid}: ${err.message}`);
          }
        }
      } else {
        console.log(`No processes found using port ${PORT}`);
      }
    } else {
      console.log(`Port ${PORT} is free`);
    }
  } catch (error) {
    // If netstat returns nothing, port is free
    if (error.code === 1) {
      console.log(`Port ${PORT} is free`);
    } else {
      console.error('Error checking port:', error.message);
    }
  }
}

killPort();








