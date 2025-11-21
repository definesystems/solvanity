#!/usr/bin/env bun

/**
 * Solvanity - High-performance Solana vanity address generator
 *
 * This CLI tool generates Solana addresses with custom prefixes and suffixes
 * using multi-threading for optimal performance. It supports multiple output
 * formats, file operations, and various configuration options.
 *
 * @author Define Labs and contributors
 * @license MIT
 */

import { Command } from 'commander';
import {Keypair} from '@solana/web3.js';
import * as bip39 from 'bip39-light';
import {derivePath} from 'ed25519-hd-key';
import {Worker, isMainThread, parentPort, workerData} from 'worker_threads';
import os from 'os';
import chalk from 'chalk';
import ora from 'ora';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode-terminal';
import crypto from 'crypto';
import { version } from './package.json' with { type: 'json' };

/**
 * Configuration constants for the application
 * Adjust these values to tune performance and behavior
 */
const CONFIG = {
  BATCH_SIZE: 100,                    // Number of addresses to process in each worker iteration
  UPDATE_INTERVAL: 250,               // UI update frequency in milliseconds
  PERFORMANCE_SAMPLE_SIZE: 100,       // Number of samples for performance averaging
  FILE_WRITE_BUFFER_SIZE: 100,        // Number of addresses to buffer before writing
  WORKER_HEALTH_CHECK_INTERVAL: 1000, // Worker health check interval in milliseconds
  THREAD_MULTIPLIER: 2,  // Multiply CPU cores by this factor for max threads
};

/**
 * Regular expression for validating Base58 characters
 * Base58 excludes: 0, O, I, l to avoid confusion
 */
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]*$/;

/**
 * Validates if a string contains only Base58 characters
 * @param {string} str - String to validate
 * @returns {boolean} True if valid Base58 or empty
 */
const isValidBase58 = (str) => {
  if (!str) return true;
  return BASE58_REGEX.test(str);
};

/**
 * Converts a BIP39 mnemonic phrase to a Solana private key
 * @param {string} mnemonic - 12-word mnemonic phrase
 * @returns {string} Base58-encoded private key
 * @throws {Error} If conversion fails
 */
const mnemonicToPrivateKey = (mnemonic) => {
  try {
    // Convert mnemonic to seed
    const seed = bip39.mnemonicToSeed(mnemonic);

    // Use Solana's standard derivation path
    const derivedPath = "m/44'/501'/0'/0'";
    const derivedSeed = derivePath(derivedPath, Buffer.from(seed).toString('hex')).key;

    // Create keypair and encode private key
    const keypair = Keypair.fromSeed(derivedSeed);
    const privateKey = bs58.encode(keypair.secretKey);

    return privateKey;
  } catch (error) {
    throw new Error(`Failed to convert mnemonic to private key: ${error.message}`);
  }
};

/**
 * Queue system for file operations to prevent race conditions
 * Ensures all file operations are performed sequentially
 */
class FileOperationQueue {
  constructor() {
    this.queue = [];           // Queue of pending operations
    this.processing = false;   // Flag to indicate if queue is being processed
    this.buffer = [];          // Buffer for batching write operations
    this.bufferTimer = null;   // Timer for flushing buffer
  }

  /**
   * Adds an operation to the queue and processes it
   * @param {Function} operation - Async function to execute
   * @returns {Promise} Resolves when operation completes
   */
  async enqueue(operation) {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.process();
    });
  }

  /**
   * Processes queued operations sequentially
   * @private
   */
  async process() {
    // Skip if already processing or queue is empty
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const { operation, resolve, reject } = this.queue.shift();

    try {
      const result = await operation();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      // Process next item in queue
      this.process();
    }
  }

  /**
   * Adds data to the write buffer for batch processing
   * @param {Object} data - Address data to buffer
   */
  addToBuffer(data) {
    this.buffer.push(data);

    // Clear existing timer to reset the flush timeout
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }

    // Flush immediately if buffer is full
    if (this.buffer.length >= CONFIG.FILE_WRITE_BUFFER_SIZE) {
      // Don't set a timer, flush immediately
      this.flushAndSave();
    } else {
      // Otherwise, set timer to flush after 1 second
      this.bufferTimer = setTimeout(() => {
        this.flushAndSave();
      }, 1000);
    }
  }

  /**
   * Internal method to flush buffer and trigger save
   * @private
   */
  async flushAndSave() {
    const data = await this.flushBuffer();
    if (data && data.length > 0 && this.saveCallback) {
      await this.saveCallback(data);
    }
  }

  /**
   * Sets the callback for saving flushed data
   * @param {Function} callback - Callback to handle saving
   */
  setSaveCallback(callback) {
    this.saveCallback = callback;
  }

  /**
   * Forces an immediate flush of the buffer
   * @returns {Promise<Array>} Array of buffered data items
   */
  async forceFlush() {
    // Clear any pending timer
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }

    // Return the flushed data
    return this.flushBuffer();
  }

  /**
   * Flushes the buffer and returns buffered data
   * @returns {Array} Array of buffered data items
   */
  async flushBuffer() {
    if (this.buffer.length === 0) return [];

    // Copy buffer contents and clear it
    const dataToWrite = [...this.buffer];
    this.buffer = [];

    // Clear timer if exists
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }

    return dataToWrite;
  }
}

/**
 * Performs atomic file write operation
 * Writes to temporary file first, then renames to prevent corruption
 * @param {string} filename - Target filename
 * @param {string} data - Data to write
 * @throws {Error} If write operation fails
 */
const writeFileAtomic = async (filename, data) => {
  const tempFile = `${filename}.tmp`;
  try {
    // Write to temporary file
    await fs.promises.writeFile(tempFile, data, 'utf8');
    // Atomically rename temp file to target
    await fs.promises.rename(tempFile, filename);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.promises.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
};

/**
 * Converts address files between JSON and TXT formats
 * @param {string} filename - File to convert
 * @param {string} targetFormat - Target format ('json' or 'txt')
 */
const convertFile = async (filename, targetFormat) => {
  const addressDir = 'address';
  let fullPath = path.join(addressDir, filename);

  // Check if file exists in the address directory
  if (!fs.existsSync(fullPath)) {
    // Try the filename as provided (might include path)
    if (fs.existsSync(filename) && filename.startsWith(addressDir)) {
      fullPath = filename;
    } else {
      console.error(chalk.red(`Error: File not found: ${fullPath}`));
      process.exit(1);
    }
  }

  console.log(chalk.cyan(`\nConverting file: ${fullPath}\n`));

  try {
    const fileContent = await fs.promises.readFile(fullPath, 'utf8');
    const ext = path.extname(fullPath).toLowerCase();
    const baseName = path.basename(fullPath, ext);

    let data = [];
    let sourceFormat = null;
    let outputFormat = null;

    // Parse JSON files
    if (ext === '.json') {
      sourceFormat = 'json';
      outputFormat = targetFormat || 'txt';

      try {
        const jsonData = JSON.parse(fileContent);
        if (Array.isArray(jsonData)) {
          // Check for valid address/mnemonic objects
          if (jsonData.length > 0 && typeof jsonData[0] === 'object' && jsonData[0].address && jsonData[0].mnemonic) {
            data = jsonData;
          } else if (jsonData.length > 0 && typeof jsonData[0] === 'string') {
            // This is a split file (addresses or mnemonics only)
            console.error(chalk.red(`Error: This appears to be a split file containing only addresses or mnemonics.`));
            console.error(chalk.red(`Conversion requires files with both address and mnemonic data.`));
            process.exit(1);
          }
        }
      } catch (err) {
        console.error(chalk.red(`Error: Invalid JSON file: ${err.message}`));
        process.exit(1);
      }
    }
    // Parse TXT files
    else if (ext === '.txt') {
      sourceFormat = 'txt';
      outputFormat = targetFormat || 'json';

      const lines = fileContent.split('\n').filter(line => line.trim());
      lines.forEach((line, index) => {
        const parts = line.split(':');
        if (parts.length === 2) {
          data.push({
            address: parts[0].trim(),
            mnemonic: parts[1].trim()
          });
        } else if (line.trim()) {
          console.warn(chalk.yellow(`Warning: Skipping invalid line ${index + 1}: ${line}`));
        }
      });
    } else {
      console.error(chalk.red(`Error: Unsupported file format. Only .json and .txt files are supported.`));
      process.exit(1);
    }

    // Validate parsed data
    if (data.length === 0) {
      console.error(chalk.red(`Error: No valid address/mnemonic pairs found in file.`));
      process.exit(1);
    }

    // Check if conversion is needed
    if (sourceFormat === outputFormat) {
      console.error(chalk.red(`Error: Source and target formats are the same (${sourceFormat}). No conversion needed.`));
      process.exit(1);
    }

    // Generate output filename
    const outputExt = outputFormat === 'json' ? '.json' : '.txt';
    const outputFilename = path.join(addressDir, `${baseName}-converted${outputExt}`);

    // Warn about overwriting existing files
    if (fs.existsSync(outputFilename)) {
      console.warn(chalk.yellow(`Warning: Output file ${outputFilename} already exists and will be overwritten.`));
    }

    // Perform conversion
    if (outputFormat === 'json') {
      await writeFileAtomic(outputFilename, JSON.stringify(data, null, 2));
    } else {
      const txtContent = data.map(item => `${item.address}:${item.mnemonic}`).join('\n') + '\n';
      await writeFileAtomic(outputFilename, txtContent);
    }

    // Display results
    console.log(chalk.green(`✔ Successfully converted ${data.length} entries\n`));
    console.log(chalk.dim(`Source format: ${chalk.cyan(sourceFormat)}`));
    console.log(chalk.dim(`Target format: ${chalk.cyan(outputFormat)}\n`));
    console.log(chalk.dim(`Output file:`));
    console.log(chalk.white(`  • ${outputFilename}\n`));
  } catch (err) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }
};

/**
 * Splits an address file into separate address and mnemonic/private key files
 * @param {string} filename - File to split
 * @param {Object} options - Split options
 * @param {string} options.format - Output format ('json' or 'txt')
 * @param {boolean} options.privatekey - Convert mnemonics to private keys
 */
const splitFile = async (filename, options) => {
  const addressDir = 'address';
  let fullPath = path.join(addressDir, filename);

  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    if (fs.existsSync(filename) && filename.startsWith(addressDir)) {
      fullPath = filename;
    } else {
      console.error(chalk.red(`Error: File not found: ${fullPath}`));
      process.exit(1);
    }
  }

  console.log(chalk.cyan(`\nSplitting file: ${fullPath}\n`));

  try {
    const fileContent = await fs.promises.readFile(fullPath, 'utf8');
    const ext = path.extname(fullPath).toLowerCase();
    const baseName = path.basename(fullPath, ext);

    let addresses = [];
    let mnemonics = [];
    let privateKeys = [];
    let detectedFormat = null;

    // Parse JSON files
    if (ext === '.json') {
      detectedFormat = 'json';
      try {
        const data = JSON.parse(fileContent);
        if (Array.isArray(data)) {
          data.forEach(item => {
            if (item.address && item.mnemonic) {
              addresses.push(item.address);
              mnemonics.push(item.mnemonic);

              // Convert to private key if requested
              if (options.privatekey) {
                try {
                  privateKeys.push(mnemonicToPrivateKey(item.mnemonic));
                } catch (err) {
                  console.warn(chalk.yellow(`Warning: Failed to convert mnemonic for address ${item.address}: ${err.message}`));
                  privateKeys.push(''); // Maintain array alignment
                }
              }
            }
          });
        }
      } catch (err) {
        console.error(chalk.red(`Error: Invalid JSON file: ${err.message}`));
        process.exit(1);
      }
    }
    // Parse TXT files
    else if (ext === '.txt') {
      detectedFormat = 'txt';
      const lines = fileContent.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length === 2) {
          addresses.push(parts[0].trim());
          mnemonics.push(parts[1].trim());

          // Convert to private key if requested
          if (options.privatekey) {
            try {
              privateKeys.push(mnemonicToPrivateKey(parts[1].trim()));
            } catch (err) {
              console.warn(chalk.yellow(`Warning: Failed to convert mnemonic for address ${parts[0].trim()}: ${err.message}`));
              privateKeys.push(''); // Maintain array alignment
            }
          }
        }
      });
    } else {
      console.error(chalk.red(`Error: Unsupported file format. Only .json and .txt files are supported.`));
      process.exit(1);
    }

    // Validate parsed data
    if (addresses.length === 0) {
      console.error(chalk.red(`Error: No valid addresses found in file.`));
      process.exit(1);
    }

    // Determine output format
    const outputFormatToUse = options.format || detectedFormat;
    const outputExt = outputFormatToUse === 'json' ? '.json' : '.txt';

    // Generate output filenames
    const addressesFile = path.join(addressDir, `${baseName}-addresses${outputExt}`);
    const secretsFile = options.privatekey
      ? path.join(addressDir, `${baseName}-privatekeys${outputExt}`)
      : path.join(addressDir, `${baseName}-mnemonics${outputExt}`);

    // Save split files
    if (outputFormatToUse === 'json') {
      await writeFileAtomic(addressesFile, JSON.stringify(addresses, null, 2));
      if (options.privatekey) {
        await writeFileAtomic(secretsFile, JSON.stringify(privateKeys, null, 2));
      } else {
        await writeFileAtomic(secretsFile, JSON.stringify(mnemonics, null, 2));
      }
    } else {
      await writeFileAtomic(addressesFile, addresses.join('\n') + '\n');
      if (options.privatekey) {
        await writeFileAtomic(secretsFile, privateKeys.join('\n') + '\n');
      } else {
        await writeFileAtomic(secretsFile, mnemonics.join('\n') + '\n');
      }
    }

    // Display results
    console.log(chalk.green(`✔ Successfully split ${addresses.length} entries\n`));
    console.log(chalk.dim(`Original file format: ${chalk.cyan(detectedFormat)}`));
    console.log(chalk.dim(`Output format: ${chalk.cyan(outputFormatToUse)}`));
    if (options.privatekey) {
      console.log(chalk.dim(`Conversion: ${chalk.cyan('Mnemonics → Private Keys')}\n`));
    }
    console.log(chalk.dim(`Created files:`));
    console.log(chalk.white(`  • ${addressesFile}`));
    console.log(chalk.white(`  • ${secretsFile}\n`));

    // Security warning for private keys
    if (options.privatekey) {
      console.log(chalk.yellow(`⚠️  Warning: Private keys have been exported!`));
      console.log(chalk.yellow(`   Keep these files secure and never share them.\n`));
    }
  } catch (err) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }
};

/**
 * Manages worker threads for parallel address generation
 * Handles worker lifecycle, health monitoring, and automatic restarts
 */
class WorkerManager {
  /**
   * @param {number} threadCount - Number of worker threads to create
   * @param {Object} workerData - Data to pass to each worker
   * @param {Function} onMessage - Callback for worker messages
   */
  constructor(threadCount, workerData, onMessage) {
    this.threadCount = threadCount;
    this.workerData = workerData;
    this.onMessage = onMessage;
    this.workers = new Map();        // Map of worker ID to worker instance
    this.workerTotals = new Map();   // Map of worker ID to addresses generated
    this.isShuttingDown = false;     // Flag to prevent new workers during shutdown
  }

  /**
   * Starts all worker threads
   */
  async start() {
    for (let i = 0; i < this.threadCount; i++) {
      await this.createWorker(i);
    }
  }

  /**
   * Creates a single worker thread
   * @param {number} id - Worker ID
   * @private
   */
  async createWorker(id) {
    // Don't create workers during shutdown
    if (this.isShuttingDown) return;

    try {
      const worker = new Worker(import.meta.url, {
        workerData: this.workerData
      });

      // Store worker and initialize counter
      this.workers.set(id, worker);
      this.workerTotals.set(id, 0);

      // Handle worker messages
      worker.on('message', (message) => {
        if (message.type === 'progress') {
          // Update this worker's total
          this.workerTotals.set(id, message.total);
        }
        // Forward message to callback
        this.onMessage(message, id);
      });

      // Handle worker errors
      worker.on('error', (err) => {
        console.error(chalk.red(`Worker ${id} error: ${err.message}`));
        // Only attempt to handle failure if not shutting down
        if (!this.isShuttingDown) {
          this.handleWorkerFailure(id);
        }
      });

      // Handle worker exit
      worker.on('exit', (code) => {
        if (code !== 0 && !this.isShuttingDown) {
          console.warn(chalk.yellow(`Worker ${id} exited with code ${code}`));
          this.handleWorkerFailure(id);
        }
        // Remove worker from map on exit
        this.workers.delete(id);
        this.workerTotals.delete(id);
      });

    } catch (error) {
      console.error(chalk.red(`Failed to create worker ${id}: ${error.message}`));
    }
  }

  /**
   * Handles worker failure by attempting to restart it
   * @param {number} id - ID of failed worker
   * @private
   */
  async handleWorkerFailure(id) {
    // Don't restart during shutdown
    if (this.isShuttingDown) return;

    // Get the worker before removing it
    const worker = this.workers.get(id);
    
    // Remove failed worker from tracking
    this.workers.delete(id);
    this.workerTotals.delete(id);

    // Only attempt restart if we had a valid worker and not shutting down
    if (worker && !this.isShuttingDown) {
      // Attempt to restart after delay
      console.log(chalk.yellow(`Attempting to restart worker ${id}...`));
      setTimeout(() => {
        if (!this.isShuttingDown) {
          this.createWorker(id);
        }
      }, 1000);
    }
  }

  /**
   * Gets total addresses generated across all workers
   * @returns {number} Total addresses generated
   */
  getTotalAddresses() {
    return Array.from(this.workerTotals.values()).reduce((sum, val) => sum + val, 0);
  }

  /**
   * Gracefully shuts down all workers
   * Sends shutdown message and waits for workers to exit
   */
  async shutdown() {
    // Prevent multiple shutdown calls
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    const shutdownPromises = [];

    // Send shutdown message to each worker
    for (const [id, worker] of this.workers) {
      shutdownPromises.push(
        new Promise((resolve) => {
          try {
            // Check if worker is still active before sending message
            if (worker.threadId !== -1) {
              // Send shutdown message
              worker.postMessage({ type: 'shutdown' });

              // Force terminate after 5 seconds
              const timeout = setTimeout(() => {
                try {
                  worker.terminate();
                } catch (err) {
                  // Worker may already be terminated
                }
                resolve();
              }, 5000);

              // Use 'once' to ensure we only add one listener
              worker.once('exit', () => {
                clearTimeout(timeout);
                resolve();
              });
            } else {
              // Worker already terminated
              resolve();
            }
          } catch (err) {
            // If any error occurs (worker already terminated, etc.), just resolve
            resolve();
          }
        })
      );
    }

    // Wait for all workers to shut down
    await Promise.all(shutdownPromises);

    // Clear internal state
    this.workers.clear();
    this.workerTotals.clear();
  }
}

/**
 * Main function to generate vanity addresses
 * Coordinates workers, handles I/O, and manages the generation process
 * @param {Object} options - Generation options from command line
 */
const generateVanityAddresses = async (options) => {
  // Extract and validate options
  const count = options.count || 1;
  const prefix = options.prefix || '';
  const suffix = options.suffix || '';
  const collectStats = options.stats || false;
  const cpuCount = os.cpus().length;
  const maxRecommendedThreads = cpuCount * CONFIG.THREAD_MULTIPLIER;
  
  // Check if this is a simple random address generation (no prefix/suffix)
  const isRandomGeneration = !prefix && !suffix;
  
  // Use only 1 thread for random generation, otherwise use specified or default thread count
  const threadCount = isRandomGeneration ? 1 : (options.threads || cpuCount);
  
  const outputMode = options.output || 'combined';
  const outputFormat = options.format || 'json';
  const showQRCodes = options.qr || false;
  const outputPrivateKeys = options.privatekey || false;
  let outputFilename = options.filename || null;
  let secretFilename = null; // For split mode

  // Add this validation after threadCount assignment:
  // Only show thread warning for vanity generation (random generation always uses 1 thread)
  if (!isRandomGeneration && threadCount > maxRecommendedThreads) {
    console.warn(chalk.yellow(`Warning: Using ${threadCount} threads (more than ${maxRecommendedThreads} recommended for your ${cpuCount}-core CPU). This may degrade performance.`));
  }

  // Ensure address directory exists
  const addressDir = 'address';
  try {
    await fs.promises.mkdir(addressDir, { recursive: true });
  } catch (err) {
    console.error(chalk.red(`Error creating address directory: ${err.message}`));
    process.exit(1);
  }

  // Generate default filename if needed
  if ((outputMode === 'combined' || outputMode === 'both' || outputMode === 'split') && !outputFilename) {
    const timestamp = Math.floor(Date.now() / 1000);
    const extension = outputFormat === 'json' ? 'json' : 'txt';
    outputFilename = `${timestamp}-address.${extension}`;
    
    // For split mode, also generate secret filename
    if (outputMode === 'split') {
      const secretType = outputPrivateKeys ? 'privatekeys' : 'mnemonics';
      secretFilename = `${timestamp}-secret-${secretType}.${extension}`;
    }
  }

  // Process filename for file output modes
  if (outputMode === 'combined' || outputMode === 'both' || outputMode === 'split') {
    // Extract basename if path is included
    if (outputFilename.includes(path.sep)) {
      outputFilename = path.basename(outputFilename);
    }

    // Ensure correct file extension
    const currentExt = path.extname(outputFilename).toLowerCase();
    const expectedExt = outputFormat === 'json' ? '.json' : '.txt';

    if (currentExt !== expectedExt) {
      const baseName = path.basename(outputFilename, currentExt);
      outputFilename = baseName + expectedExt;
    }

    // Add address directory prefix
    outputFilename = path.join(addressDir, outputFilename);
    
    // Process secret filename for split mode
    if (outputMode === 'split' && secretFilename) {
      secretFilename = path.join(addressDir, secretFilename);
    }
  }

  // Initialize file operation queue
  const fileQueue = new FileOperationQueue();
  const secretQueue = outputMode === 'split' ? new FileOperationQueue() : null;
  
  // Set up the save callback for automatic flushing (combined and both modes)
  if (outputMode === 'combined' || outputMode === 'both') {
    fileQueue.setSaveCallback(async (dataToWrite) => {
      if (!dataToWrite || dataToWrite.length === 0) return;

      await fileQueue.enqueue(async () => {
        if (outputFormat === 'json') {
          // Read existing data
          const fileContent = await fs.promises.readFile(outputFilename, 'utf8');
          let data = [];
          try {
            data = JSON.parse(fileContent);
            if (!Array.isArray(data)) data = [];
          } catch (err) {
            data = [];
          }

          // Append new data
          data.push(...dataToWrite);

          // Write atomically
          await writeFileAtomic(outputFilename, JSON.stringify(data, null, 2));
        } else {
          // For TXT format, append lines
          const lines = dataToWrite.map(item => {
            // Determine which secret to use for TXT format
            const secret = item.privateKey || item.mnemonic;
            return `${item.address}:${secret}`;
          }).join('\n') + '\n';
          
          // Append to file
          await fs.promises.appendFile(outputFilename, lines);
        }
      });
    });
  }
  
  // Set up callbacks for split mode
  if (outputMode === 'split') {
    // Address file callback
    fileQueue.setSaveCallback(async (dataToWrite) => {
      if (!dataToWrite || dataToWrite.length === 0) return;

      await fileQueue.enqueue(async () => {
        if (outputFormat === 'json') {
          // Read existing data
          const fileContent = await fs.promises.readFile(outputFilename, 'utf8');
          let data = [];
          try {
            data = JSON.parse(fileContent);
            if (!Array.isArray(data)) data = [];
          } catch (err) {
            data = [];
          }

          // Append only addresses
          data.push(...dataToWrite.map(item => item.address));

          // Write atomically
          await writeFileAtomic(outputFilename, JSON.stringify(data, null, 2));
        } else {
          // For TXT format, append addresses only
          const lines = dataToWrite.map(item => item.address).join('\n') + '\n';
          await fs.promises.appendFile(outputFilename, lines);
        }
      });
    });
    
    // Secret file callback
    secretQueue.setSaveCallback(async (dataToWrite) => {
      if (!dataToWrite || dataToWrite.length === 0) return;

      await secretQueue.enqueue(async () => {
        if (outputFormat === 'json') {
          // Read existing data
          const fileContent = await fs.promises.readFile(secretFilename, 'utf8');
          let data = [];
          try {
            data = JSON.parse(fileContent);
            if (!Array.isArray(data)) data = [];
          } catch (err) {
            data = [];
          }

          // Append only secrets
          const secrets = dataToWrite.map(item => item.privateKey || item.mnemonic);
          data.push(...secrets);

          // Write atomically
          await writeFileAtomic(secretFilename, JSON.stringify(data, null, 2));
        } else {
          // For TXT format, append secrets only
          const lines = dataToWrite.map(item => item.privateKey || item.mnemonic).join('\n') + '\n';
          await fs.promises.appendFile(secretFilename, lines);
        }
      });
    });
  }

  // Initialize output file
  if (outputMode === 'combined' || outputMode === 'both' || outputMode === 'split') {
    try {
      if (outputFormat === 'json') {
        // Initialize main file
        if (fs.existsSync(outputFilename)) {
          try {
            const fileContent = await fs.promises.readFile(outputFilename, 'utf8');
            const existingData = JSON.parse(fileContent);
            if (!Array.isArray(existingData)) {
              await writeFileAtomic(outputFilename, JSON.stringify([], null, 2));
            }
          } catch (err) {
            console.warn(chalk.yellow(`Warning: Could not parse existing file ${outputFilename}, creating new file`));
            await writeFileAtomic(outputFilename, JSON.stringify([], null, 2));
          }
        } else {
          // Create new empty JSON array file
          await writeFileAtomic(outputFilename, JSON.stringify([], null, 2));
        }
        
        // Initialize secret file for split mode
        if (outputMode === 'split' && secretFilename) {
          if (fs.existsSync(secretFilename)) {
            try {
              const fileContent = await fs.promises.readFile(secretFilename, 'utf8');
              const existingData = JSON.parse(fileContent);
              if (!Array.isArray(existingData)) {
                await writeFileAtomic(secretFilename, JSON.stringify([], null, 2));
              }
            } catch (err) {
              console.warn(chalk.yellow(`Warning: Could not parse existing file ${secretFilename}, creating new file`));
              await writeFileAtomic(secretFilename, JSON.stringify([], null, 2));
            }
          } else {
            await writeFileAtomic(secretFilename, JSON.stringify([], null, 2));
          }
        }
      } else {
        // For TXT format, create empty files
        await fs.promises.writeFile(outputFilename, '');
        
        if (outputMode === 'split' && secretFilename) {
          await fs.promises.writeFile(secretFilename, '');
        }
      }
    } catch (err) {
      console.error(chalk.red(`Error initializing output file: ${err.message}`));
      process.exit(1);
    }
  }

  // Validate prefix/suffix constraints
  if (prefix.length > 7) {
    console.error('Error: Prefix must be 7 characters or less');
    process.exit(1);
  }

  if (suffix.length > 7) {
    console.error('Error: Suffix must be 7 characters or less');
    process.exit(1);
  }

  if (!isValidBase58(prefix) || !isValidBase58(suffix)) {
    console.error('Error: Prefix and suffix must contain only valid Base58 characters');
    process.exit(1);
  }

  // Warn about large generation counts
  if (count > 1000) {
    console.warn(chalk.yellow(`Warning: Generating a large number of addresses (${count}). This may take a while.`));
  }

  // Initialize tracking variables
  const results = [];
  const startTimeNs = Bun.nanoseconds();
  const startTimeMs = performance.now();
  let isCompleting = false; // Flag to prevent multiple completion calls
  let hasCompleted = false; // Flag to track if we've already completed

  // Initialize performance tracking
  let performanceData = collectStats ? {
    total: 0,
    seed: 0,
    derive: 0,
    keypair: 0,
    samples: 0
  } : null;

  // Display system information
  console.log(chalk.dim(`CPU: ${chalk.cyan(os.cpus()[0].model + " [" + os.machine() + "]")}`));
  console.log(chalk.dim(`CPU cores: ${chalk.cyan(os.cpus().length)}`));
  
  // Show thread count - for random generation it's always 1
  if (isRandomGeneration) {
    console.log(chalk.dim(`Threads spawned: ${chalk.cyan('1')} (optimized for random generation)`));
  } else {
    console.log(chalk.dim(`Threads spawned: ${chalk.cyan(threadCount)}`));
  }
  
  console.log(chalk.dim(`Prefix: ${chalk.cyan(prefix || '-')}`));
  console.log(chalk.dim(`Suffix: ${chalk.cyan(suffix || '-')}`));
  console.log(chalk.dim(`Addresses: ${chalk.cyan(count)}`));
  if (outputPrivateKeys) {
    console.log(chalk.dim(`Secret format: ${chalk.cyan('Private Keys')}`));
  }

  // Load blacklist if available
  let blacklist = new Set();
  const blacklistFile = 'blacklist';

  try {
    if (fs.existsSync(blacklistFile)) {
      const blacklistContent = await fs.promises.readFile(blacklistFile, 'utf8');
      const words = blacklistContent
        .split('\n')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0);

      blacklist = new Set(words);
      if (blacklist.size > 0) {
        console.log(chalk.dim(`Blacklist: ${chalk.cyan(blacklist.size + " words")}`));
      }
    }
  } catch (err) {
    console.warn(chalk.yellow(`\nWarning: Could not load blacklist file: ${err.message}`));
  }

  // Display output configuration
  if (showQRCodes && (outputMode === 'display' || outputMode === 'both')) {
    console.log(chalk.dim(`QR codes: ${chalk.cyan('enabled')}`));
  }

  console.log(chalk.dim(`Output mode: ${chalk.cyan(outputMode)}`));

  if (outputMode === 'combined' || outputMode === 'both') {
    console.log(chalk.dim(`Output format: ${chalk.cyan(outputFormat)}`));
    console.log(chalk.dim(`Output file: ${chalk.cyan(outputFilename)}`));
  } else if (outputMode === 'split') {
    console.log(chalk.dim(`Output format: ${chalk.cyan(outputFormat)}`));
    console.log(chalk.dim(`Address file: ${chalk.cyan(outputFilename)}`));
    console.log(chalk.dim(`Secret file: ${chalk.cyan(secretFilename)}`));
  }

  // Add mode information for clarity
  if (isRandomGeneration) {
    console.log(chalk.dim(`Mode: ${chalk.cyan('Random address generation')}`));
  } else {
    console.log(chalk.dim(`Mode: ${chalk.cyan('Vanity address generation')}`));
  }

  console.log();

  // Show note about thread usage for random generation if user tried to set threads manually
  if (isRandomGeneration && options.threads && options.threads !== 1) {
    console.log(chalk.yellow(`Note: Random address generation (no prefix/suffix) always uses 1 thread for optimal performance.\n`));
  }

  // Initialize progress spinner
  const spinner = ora({
    text: `Processing addresses...`,
    color: 'cyan'
  }).start();

  /**
   * Saves buffered addresses to file
   * Called periodically and at completion
   */
  const saveBufferedAddresses = async () => {
    if (outputMode === 'display') return;

    if (outputMode === 'split') {
      // For split mode, save addresses and secrets separately
      const dataToWrite = await fileQueue.forceFlush();
      const secretDataToWrite = await secretQueue.forceFlush();
      
      if (dataToWrite && dataToWrite.length > 0) {
        await fileQueue.enqueue(async () => {
          if (outputFormat === 'json') {
            // Read existing data
            const fileContent = await fs.promises.readFile(outputFilename, 'utf8');
            let data = [];
            try {
              data = JSON.parse(fileContent);
              if (!Array.isArray(data)) data = [];
            } catch (err) {
              data = [];
            }

            // Append only addresses
            data.push(...dataToWrite.map(item => item.address));

            // Write atomically
            await writeFileAtomic(outputFilename, JSON.stringify(data, null, 2));
          } else {
            // For TXT format, append addresses only
            const lines = dataToWrite.map(item => item.address).join('\n') + '\n';
            await fs.promises.appendFile(outputFilename, lines);
          }
        });
      }
      
      if (secretDataToWrite && secretDataToWrite.length > 0) {
        await secretQueue.enqueue(async () => {
          if (outputFormat === 'json') {
            // Read existing data
            const fileContent = await fs.promises.readFile(secretFilename, 'utf8');
            let data = [];
            try {
              data = JSON.parse(fileContent);
              if (!Array.isArray(data)) data = [];
            } catch (err) {
              data = [];
            }

            // Append only secrets
            const secrets = secretDataToWrite.map(item => item.privateKey || item.mnemonic);
            data.push(...secrets);

            // Write atomically
            await writeFileAtomic(secretFilename, JSON.stringify(data, null, 2));
          } else {
            // For TXT format, append secrets only
            const lines = secretDataToWrite.map(item => item.privateKey || item.mnemonic).join('\n') + '\n';
            await fs.promises.appendFile(secretFilename, lines);
          }
        });
      }
    } else if (outputMode === 'combined' || outputMode === 'both') {
      // For combined and both modes, save address:secret pairs
      const dataToWrite = await fileQueue.forceFlush();
      if (!dataToWrite || dataToWrite.length === 0) return;

      await fileQueue.enqueue(async () => {
        if (outputFormat === 'json') {
          // Read existing data
          const fileContent = await fs.promises.readFile(outputFilename, 'utf8');
          let data = [];
          try {
            data = JSON.parse(fileContent);
            if (!Array.isArray(data)) data = [];
          } catch (err) {
            data = [];
          }

          // Append new data
          data.push(...dataToWrite);

          // Write atomically
          await writeFileAtomic(outputFilename, JSON.stringify(data, null, 2));
        } else {
          // For TXT format, append lines
          const lines = dataToWrite.map(item => {
            // Determine which secret to use for TXT format
            const secret = item.privateKey || item.mnemonic;
            return `${item.address}:${secret}`;
          }).join('\n') + '\n';
          
          // Append to file
          await fs.promises.appendFile(outputFilename, lines);
        }
      });
    }
  };

  // Create worker manager with message handler
  const workerManager = new WorkerManager(
    threadCount,
    {prefix, suffix, collectStats, blacklist, outputPrivateKeys, isRandomGeneration, targetCount: count},
    async (message, workerId) => {
      // Handle performance metrics
      if (message.type === 'performance' && collectStats) {
        const metrics = message.metrics;
        const oldSamples = performanceData.samples;
        const newSamples = oldSamples + CONFIG.PERFORMANCE_SAMPLE_SIZE;

        // Calculate weighted average
        performanceData.total = (performanceData.total * oldSamples + metrics.total * CONFIG.PERFORMANCE_SAMPLE_SIZE) / newSamples;
        performanceData.seed = (performanceData.seed * oldSamples + metrics.seed * CONFIG.PERFORMANCE_SAMPLE_SIZE) / newSamples;
        performanceData.derive = (performanceData.derive * oldSamples + metrics.derive * CONFIG.PERFORMANCE_SAMPLE_SIZE) / newSamples;
        performanceData.keypair = (performanceData.keypair * oldSamples + metrics.keypair * CONFIG.PERFORMANCE_SAMPLE_SIZE) / newSamples;
        performanceData.samples = newSamples;
      }
      // Handle found addresses
      else if (message.type === 'result') {
        // Skip if we've already reached the target or are completing
        if (results.length >= count || isCompleting) {
          return;
        }

        // Determine which secret to use (private key or mnemonic)
        const secret = outputPrivateKeys && message.privateKey ? message.privateKey : message.mnemonic;

        // Add to results
        results.push({
          address: message.address,
          mnemonic: message.mnemonic,
          privateKey: message.privateKey,
          secret: secret
        });

        // Buffer for file output
        if (outputMode === 'combined' || outputMode === 'both') {
          const dataItem = outputPrivateKeys
            ? {address: message.address, privateKey: message.privateKey || secret}
            : {address: message.address, mnemonic: message.mnemonic};
          fileQueue.addToBuffer(dataItem);
        } else if (outputMode === 'split') {
          // Buffer addresses and secrets separately
          fileQueue.addToBuffer({address: message.address});
          secretQueue.addToBuffer({
            privateKey: outputPrivateKeys ? (message.privateKey || secret) : null,
            mnemonic: !outputPrivateKeys ? message.mnemonic : null
          });
        }

        // Check if we've reached the target count
        if (results.length >= count && !isCompleting) {
          isCompleting = true; // Set flag to prevent multiple calls
          await handleCompletion();
        }
      }
    }
  );

  /**
   * Cleanup function for graceful shutdown
   * @param {string} signal - Signal name that triggered shutdown
   */
  const cleanupAndExit = async (signal) => {
    // Stop the update interval first to freeze the display
    clearInterval(updateInterval);

    // Stop spinner without clearing the output
    spinner.stop();

    // Calculate final statistics
    const grandTotalAddresses = workerManager.getTotalAddresses();
    const elapsedNs = Bun.nanoseconds() - startTimeNs;
    const elapsedSeconds = elapsedNs / 1_000_000_000;
    const finalSpeed = Math.floor(grandTotalAddresses / elapsedSeconds);

    // Format elapsed time
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = Math.floor(elapsedSeconds % 60);
    const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Display final statistics
    console.log(chalk.bold(`≡ Statistics:`));
    console.log(`   ${chalk.bold(`Found:`)} ${results.length > 0 ? chalk.dim.green.bold(results.length) : chalk.dim.red.bold(results.length)}`);
    console.log(`   Generated: ${chalk.yellow(grandTotalAddresses.toLocaleString())}`);
    if (!isRandomGeneration) {
      console.log(`   Success rate: ${chalk.green((results.length / grandTotalAddresses * 100).toFixed(5) + '%')}`);
    }
    console.log(`   Speed (addr/s): ${chalk.cyan(finalSpeed.toLocaleString())}`);
    console.log(`   Time elapsed: ${chalk.magenta(timeFormatted)}`);

    // Display performance data if it was being collected
    if (collectStats && performanceData && performanceData.samples > 0) {
      console.log(chalk.dim(`\n≡ Performance (ms):`));
      console.log(chalk.dim(`   Time per address: ${performanceData.total.toFixed(2)}`));
      console.log(chalk.dim(`   Seed: ${performanceData.seed.toFixed(2)} (${(performanceData.seed / performanceData.total * 100).toFixed(1)}%)`));
      console.log(chalk.dim(`   Derive: ${performanceData.derive.toFixed(2)} (${(performanceData.derive / performanceData.total * 100).toFixed(1)}%)`));
      console.log(chalk.dim(`   Keypair: ${performanceData.keypair.toFixed(2)} (${(performanceData.keypair / performanceData.total * 100).toFixed(1)}%)`));
    }

    // Now show the interruption message
    console.log(chalk.red(`\n❌ Interrupted by ${signal}\n`));

    // IMPORTANT: Force flush any buffered data before exiting
    await saveBufferedAddresses();

    // If any results were saved, notify the user
    if (results.length > 0 && (outputMode === 'combined' || outputMode === 'both')) {
      console.log(chalk.yellow(`💾 Partial results (${results.length} addresses) have been saved to: ${chalk.white(outputFilename)}\n`));
    } else if (results.length > 0 && outputMode === 'split') {
      console.log(chalk.yellow(`💾 Partial results (${results.length} addresses) have been saved to:`));
      console.log(chalk.white(`  • Addresses: ${outputFilename}`));
      console.log(chalk.white(`  • Secrets: ${secretFilename}\n`));
    }

    // Shutdown workers
    await workerManager.shutdown();
    process.exit(1);
  };

  // Register signal handlers for graceful shutdown
  process.on('SIGINT', () => cleanupAndExit('SIGINT'));
  process.on('SIGTERM', () => cleanupAndExit('SIGTERM'));

  // Update spinner with progress information
  const updateInterval = setInterval(() => {
    const grandTotalAddresses = workerManager.getTotalAddresses();
    const elapsedNs = Bun.nanoseconds() - startTimeNs;
    const elapsedSeconds = elapsedNs / 1_000_000_000;
    const speed = Math.floor(grandTotalAddresses / elapsedSeconds);

    // Format elapsed time as MM:SS
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = Math.floor(elapsedSeconds % 60);
    const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Build status text
    let statusText = chalk.bold(`Processing addresses...\n`);
    statusText += `   ${chalk.bold(`Found:`)} ${results.length > 0 ? chalk.dim.green.bold(results.length) : chalk.dim.red.bold(results.length)}\n   Generated: ${chalk.yellow(grandTotalAddresses.toLocaleString())}\n   Speed (addr/s): ${chalk.cyan(speed.toLocaleString())}\n   Time elapsed: ${chalk.magenta(timeFormatted)}\n`;

    // Add performance stats if enabled
    if (collectStats && performanceData && performanceData.samples > 0) {
      statusText += chalk.dim(`\n≡ Performance (ms):\n`
        + `   Time per address: ${performanceData.total.toFixed(2)}\n`
        + `   Seed: ${chalk.dim(performanceData.seed.toFixed(2))} (${chalk.dim((performanceData.seed / performanceData.total * 100).toFixed(1))}%)\n`
        + `   Derive: ${chalk.dim(performanceData.derive.toFixed(2))} (${chalk.dim((performanceData.derive / performanceData.total * 100).toFixed(1))}%)\n`
        + `   Keypair: ${chalk.dim(performanceData.keypair.toFixed(2))} (${chalk.dim((performanceData.keypair / performanceData.total * 100).toFixed(1))}%)\n`);
    }

    spinner.text = statusText;
  }, CONFIG.UPDATE_INTERVAL);

  /**
   * Handles completion of address generation
   * Saves remaining data, displays results, and shuts down
   */
  const handleCompletion = async () => {
    // Prevent multiple executions
    if (hasCompleted) return;
    hasCompleted = true;

    // Calculate final statistics
    const grandTotalAddresses = workerManager.getTotalAddresses();
    const elapsedNs = Bun.nanoseconds() - startTimeNs;
    const elapsedSeconds = elapsedNs / 1_000_000_000;
    const finalSpeed = Math.floor(grandTotalAddresses / elapsedSeconds);

    // Stop UI updates
    clearInterval(updateInterval);
    spinner.stop();

    // IMPORTANT: Force flush any remaining buffered addresses before displaying results
    // This ensures all found addresses are saved to file
    await saveBufferedAddresses();

    // Display performance statistics if enabled
    if (collectStats && performanceData && performanceData.samples > 0) {
      console.log(chalk.dim('Performance data:'));
      console.log(chalk.dim(`  Average time per address: ${performanceData.total.toFixed(3)} ms`));
      console.log(chalk.dim(`  Seed generation: ${performanceData.seed.toFixed(3)} ms (${(performanceData.seed / performanceData.total * 100).toFixed(1)}%)`));
      console.log(chalk.dim(`  Key derivation: ${performanceData.derive.toFixed(3)} ms (${(performanceData.derive / performanceData.total * 100).toFixed(1)}%)`));
      console.log(chalk.dim(`  Keypair creation: ${performanceData.keypair.toFixed(3)} ms (${(performanceData.keypair / performanceData.total * 100).toFixed(1)}%)\n`));
    }

    // Display completion summary based on generation mode
    if (isRandomGeneration) {
      console.log(chalk.dim.green.bold(`✔ Generated ${chalk.white(count)} random addresses in ${chalk.white(elapsedSeconds.toFixed(2))} seconds\n`));
    } else {
      console.log(chalk.dim.green.bold(`✔ Done in ${chalk.white(elapsedSeconds.toFixed(2))} seconds after processing ${chalk.white(grandTotalAddresses.toLocaleString())} addresses, with an average of ${chalk.white(finalSpeed.toLocaleString())} addr/s\n`));
    }

    // Display file save confirmation
    if (outputMode === 'combined' || outputMode === 'both') {
      console.log(chalk.cyan(`Results have been saved to file: ${chalk.white(outputFilename)}\n`));
      if (outputPrivateKeys) {
        console.log(chalk.yellow(`⚠️  Warning: Private keys have been saved!`));
        console.log(chalk.yellow(`   Keep this file secure and never share it.\n`));
      }
    } else if (outputMode === 'split') {
      console.log(chalk.cyan(`Results have been saved to files:\n`));
      console.log(chalk.white(`  • Addresses: ${outputFilename}`));
      console.log(chalk.white(`  • Secrets: ${secretFilename}\n`));
      if (outputPrivateKeys) {
        console.log(chalk.yellow(`⚠️  Warning: Private keys have been saved!`));
        console.log(chalk.yellow(`   Keep the secret file secure and never share it.\n`));
      }
    }

    // Display results on screen if requested
    if (outputMode === 'display' || outputMode === 'both') {
      console.log(chalk.dim.blue.bold(`GENERATED ADDRESSES:\n`));

      results.slice(0, count).forEach(({address, secret}, index) => {
        console.log(chalk.underline.cyan(`Address ${index + 1}`));

        // Display QR code if enabled
        if (showQRCodes) {
          qrcode.generate(address, {small: true});
        }

        console.log(address);
        console.log(chalk.dim(secret));
        console.log();
      });
    }

    // Shutdown workers and exit
    await workerManager.shutdown();
    process.exit(0);
  };

  // Start worker threads
  await workerManager.start();
};

/**
 * Generates a random distribution of tokens across wallets
 * @param {Object} options - Distribution options from command line
 */
const distributeTokens = async (options) => {
  const amount = parseFloat(options.amount);
  const wallets = parseInt(options.wallets);
  const minAmount = options.min ? parseFloat(options.min) : 0;
  const maxAmount = options.max ? parseFloat(options.max) : amount;
  const decimals = options.decimals ? parseInt(options.decimals) : 0;
  const unique = options.unique || false;
  const format = options.format || 'json';
  const verbose = options.verbose || false;

  // Validation
  if (isNaN(amount) || amount <= 0) {
    console.error(chalk.red('Error: Amount must be a positive number'));
    process.exit(1);
  }

  if (isNaN(wallets) || wallets <= 0) {
    console.error(chalk.red('Error: Number of wallets must be a positive integer'));
    process.exit(1);
  }

  if (minAmount < 0) {
    console.error(chalk.red('Error: Minimum amount cannot be negative'));
    process.exit(1);
  }

  if (maxAmount > amount) {
    console.error(chalk.red('Error: Maximum amount cannot exceed total amount'));
    process.exit(1);
  }

  if (minAmount > maxAmount) {
    console.error(chalk.red('Error: Minimum amount cannot exceed maximum amount'));
    process.exit(1);
  }

  if (minAmount * wallets > amount) {
    console.error(chalk.red(`Error: Minimum amount (${minAmount}) × wallets (${wallets}) = ${minAmount * wallets} exceeds total amount (${amount})`));
    process.exit(1);
  }

  if (maxAmount * wallets < amount) {
    console.error(chalk.red(`Error: Maximum amount (${maxAmount}) × wallets (${wallets}) = ${maxAmount * wallets} is less than total amount (${amount})`));
    process.exit(1);
  }

  if (decimals < 0 || decimals > 18) {
    console.error(chalk.red('Error: Decimals must be between 0 and 18'));
    process.exit(1);
  }

  if (!['json', 'txt'].includes(format)) {
    console.error(chalk.red('Error: Format must be "json" or "txt"'));
    process.exit(1);
  }

  // Ensure address directory exists
  const addressDir = 'address';
  try {
    await fs.promises.mkdir(addressDir, { recursive: true });
  } catch (err) {
    console.error(chalk.red(`Error creating address directory: ${err.message}`));
    process.exit(1);
  }

  // Generate filename
  const timestamp = Math.floor(Date.now() / 1000);
  const extension = format === 'json' ? 'json' : 'txt';
  const filename = path.join(addressDir, `${timestamp}-distribution.${extension}`);

  // Display configuration
  console.log(chalk.cyan(`\nGenerating token distribution...\n`));
  console.log(chalk.dim(`Total amount: ${chalk.cyan(amount)}`));
  console.log(chalk.dim(`Number of wallets: ${chalk.cyan(wallets)}`));
  console.log(chalk.dim(`Min amount per wallet: ${chalk.cyan(minAmount || 'auto')}`));
  console.log(chalk.dim(`Max amount per wallet: ${chalk.cyan(maxAmount || 'auto')}`));
  console.log(chalk.dim(`Decimal places: ${chalk.cyan(decimals)}`));
  console.log(chalk.dim(`Unique values: ${chalk.cyan(unique ? 'yes' : 'no')}`));
  console.log(chalk.dim(`Output format: ${chalk.cyan(format)}`));
  console.log(chalk.dim(`Output file: ${chalk.cyan(filename)}\n`));

  // Function to generate cryptographically secure random number between 0 and 1
  const getSecureRandom = () => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / (0xFFFFFFFF + 1);
  };

  // Function to generate cryptographically secure random number in range
  const getSecureRandomInRange = (min, max) => {
    return getSecureRandom() * (max - min) + min;
  };

  // Function to round to a random number of decimals (0 to max)
  const roundToRandomDecimals = (value, maxDec) => {
    if (maxDec === 0) return Math.round(value);
    
    // Randomly choose how many decimal places to use (0 to maxDec)
    const actualDecimals = Math.floor(getSecureRandom() * (maxDec + 1));
    const multiplier = Math.pow(10, actualDecimals);
    const rounded = Math.round(value * multiplier) / multiplier;
    
    // Format to remove trailing zeros but keep the actual precision
    return parseFloat(rounded.toFixed(actualDecimals));
  };

  // Function to round to specified decimals (for final corrections)
  const roundToDecimals = (value, dec) => {
    const multiplier = Math.pow(10, dec);
    return Math.round(value * multiplier) / multiplier;
  };

  // Generate distribution
  let distribution = [];
  let remaining = amount;
  const usedValues = new Set();

  // Generate random values for each wallet
  for (let i = 0; i < wallets; i++) {
    let walletAmount;
    
    if (i === wallets - 1) {
      // Last wallet gets the remaining amount to ensure exact total
      walletAmount = parseFloat(remaining.toFixed(decimals));
      
      // Remove unnecessary trailing zeros
      if (decimals > 0) {
        const str = walletAmount.toString();
        if (str.includes('.')) {
          walletAmount = parseFloat(walletAmount);
        }
      }
      
      // If unique is required and this value already exists, we need to regenerate
      if (unique && usedValues.has(walletAmount)) {
        console.log(chalk.yellow(`Regenerating distribution - last wallet value was not unique`));
        // Reset and start over
        distribution = [];
        remaining = amount;
        usedValues.clear();
        i = -1; // Will be incremented to 0 in the next iteration
        continue;
      }
      
      usedValues.add(walletAmount);
    } else {
      // Calculate the range for this wallet
      const walletsLeft = wallets - i;
      const currentMin = Math.max(minAmount, remaining - maxAmount * (walletsLeft - 1));
      const currentMax = Math.min(maxAmount, remaining - minAmount * (walletsLeft - 1));
      
      // Generate random amount within the range
      if (unique) {
        // Generate unique value - keep trying until we get one
        let attempts = 0;
        const maxAttempts = 100000; // Very high limit for unique generation
        
        do {
          const randomValue = getSecureRandomInRange(currentMin, currentMax);
          // Use random number of decimal places for more variety
          walletAmount = roundToRandomDecimals(randomValue, decimals);
          attempts++;
          
          if (attempts > maxAttempts) {
            // If we absolutely can't find a unique value, restart the entire generation
            if (verbose) {
              console.log(chalk.yellow(`Regenerating distribution - could not find unique value for wallet ${i + 1}`));
            }
            distribution = [];
            remaining = amount;
            usedValues.clear();
            i = -1; // Will be incremented to 0 in the next iteration
            break;
          }
        } while (usedValues.has(walletAmount));
        
        if (attempts > maxAttempts) {
          continue; // Restart the entire generation
        }
        
        usedValues.add(walletAmount);
      } else {
        // Generate non-unique value with random decimal places
        const randomValue = getSecureRandomInRange(currentMin, currentMax);
        walletAmount = roundToRandomDecimals(randomValue, decimals);
      }
      
      // Update remaining with full precision
      remaining = remaining - walletAmount;
    }
    
    distribution.push(walletAmount);
  }

  // Shuffle the distribution to avoid patterns (largest/smallest at the end)
  for (let i = distribution.length - 1; i > 0; i--) {
    const j = Math.floor(getSecureRandom() * (i + 1));
    [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
  }

  // Verify the sum equals the total amount (within floating point precision)
  const actualSum = distribution.reduce((sum, val) => sum + val, 0);
  const sumDifference = Math.abs(actualSum - amount);
  const tolerance = Math.pow(10, -Math.min(decimals, 10)); // Reasonable tolerance
  
  if (sumDifference > tolerance) {
    if (verbose) {
      console.warn(chalk.yellow(`Note: Adjusting for rounding difference of ${sumDifference.toFixed(decimals)}`));
    }
    
    const adjustment = amount - actualSum;
    
    // Find suitable candidates for adjustment that won't violate min/max constraints
    let adjusted = false;
    
    // Try to find an item that can be adjusted without violating constraints
    for (let i = 0; i < distribution.length; i++) {
      const newValue = distribution[i] + adjustment;
      
      // Check if the adjusted value would still be within bounds
      if (newValue >= minAmount && newValue <= maxAmount) {
        distribution[i] = parseFloat(newValue.toFixed(decimals));
        
        // Remove trailing zeros
        if (distribution[i].toString().includes('.')) {
          distribution[i] = parseFloat(distribution[i]);
        }
        
        adjusted = true;
        break;
      }
    }
    
    // If we couldn't adjust a single value, distribute the adjustment across multiple values
    if (!adjusted && Math.abs(adjustment) > tolerance) {
      const smallAdjustment = adjustment / distribution.length;
      let remainingAdjustment = adjustment;
      
      for (let i = 0; i < distribution.length && Math.abs(remainingAdjustment) > tolerance; i++) {
        const currentValue = distribution[i];
        const proposedValue = currentValue + smallAdjustment;
        
        // Only adjust if it stays within bounds
        if (proposedValue >= minAmount && proposedValue <= maxAmount) {
          const actualAdjustment = Math.min(
            Math.abs(remainingAdjustment),
            Math.abs(smallAdjustment)
          ) * Math.sign(remainingAdjustment);
          
          // Make sure the adjustment doesn't push the value out of bounds
          const finalValue = currentValue + actualAdjustment;
          if (finalValue >= minAmount && finalValue <= maxAmount) {
            distribution[i] = parseFloat(finalValue.toFixed(decimals));
            
            // Remove trailing zeros
            if (distribution[i].toString().includes('.')) {
              distribution[i] = parseFloat(distribution[i]);
            }
            
            remainingAdjustment -= actualAdjustment;
          }
        }
      }
      
      if (Math.abs(remainingAdjustment) > tolerance) {
        if (verbose) {
          console.warn(chalk.yellow(`Warning: Could not fully correct rounding error. Remaining: ${remainingAdjustment.toFixed(decimals)}`));
        }
      }
    }
    
    const correctedSum = distribution.reduce((sum, val) => sum + val, 0);
    if (verbose) {
      console.log(chalk.green(`✔ Sum corrected: ${correctedSum.toFixed(decimals)}`));
    }
  }
  
  // Final validation: ensure all values are within min/max bounds
  let violationsFound = false;
  distribution = distribution.map((value, index) => {
    if (value < minAmount || value > maxAmount) {
      violationsFound = true;
      if (verbose) {
        console.warn(chalk.yellow(`Warning: Wallet ${index + 1} value ${value} was out of bounds`));
      }
      
      // Clamp the value to the valid range
      const clampedValue = Math.max(minAmount, Math.min(maxAmount, value));
      return parseFloat(clampedValue.toFixed(decimals));
    }
    return value;
  });
  
  if (violationsFound) {
    // If we had to clamp values, the sum might be off again
    // In this case, regenerate the distribution with tighter controls
    if (verbose) {
      console.log(chalk.yellow(`Regenerating distribution due to constraint violations...`));
    }
    
    // Reset and try again with more conservative approach
    distribution = [];
    remaining = amount;
    usedValues.clear();
    
    // More conservative generation that respects bounds
    for (let i = 0; i < wallets; i++) {
      let walletAmount;
      
      if (i === wallets - 1) {
        // Last wallet gets the remaining amount, but clamped to bounds
        walletAmount = Math.max(minAmount, Math.min(maxAmount, remaining));
        
        // Format properly
        walletAmount = parseFloat(walletAmount.toFixed(decimals));
        if (walletAmount.toString().includes('.')) {
          walletAmount = parseFloat(walletAmount);
        }
        
        // Check uniqueness for the last wallet
        if (unique && usedValues.has(walletAmount)) {
          if (verbose) {
            console.log(chalk.yellow(`Regenerating distribution - last wallet value was not unique after correction`));
          }
          // Reset and start over
          distribution = [];
          remaining = amount;
          usedValues.clear();
          i = -1; // Will be incremented to 0 in the next iteration
          continue;
        }
        
        usedValues.add(walletAmount);
      } else {
        // Calculate the range for this wallet
        const walletsLeft = wallets - i;
        
        // More conservative bounds calculation
        const theoreticalMin = remaining - maxAmount * (walletsLeft - 1);
        const theoreticalMax = remaining - minAmount * (walletsLeft - 1);
        
        const currentMin = Math.max(minAmount, theoreticalMin);
        const currentMax = Math.min(maxAmount, theoreticalMax);
        
        // Add small buffer to avoid edge cases
        const buffer = Math.pow(10, -decimals);
        const safeMin = currentMin + buffer;
        const safeMax = currentMax - buffer;
        
        // Generate random amount within the safe range
        if (unique) {
          let attempts = 0;
          const maxAttempts = 100000;
          
          do {
            const randomValue = getSecureRandomInRange(safeMin, safeMax);
            walletAmount = roundToRandomDecimals(randomValue, decimals);
            
            // Ensure it's within bounds
            walletAmount = Math.max(minAmount, Math.min(maxAmount, walletAmount));
            attempts++;
            
            if (attempts > maxAttempts) {
              // Restart entire generation if we can't find unique values
              if (verbose) {
                console.log(chalk.yellow(`Regenerating distribution - could not find unique value in conservative generation`));
              }
              distribution = [];
              remaining = amount;
              usedValues.clear();
              i = -1;
              break;
            }
          } while (usedValues.has(walletAmount));
          
          if (attempts > maxAttempts) {
            continue; // Restart
          }
          
          usedValues.add(walletAmount);
        } else {
          const randomValue = getSecureRandomInRange(safeMin, safeMax);
          walletAmount = roundToRandomDecimals(randomValue, decimals);
          walletAmount = Math.max(minAmount, Math.min(maxAmount, walletAmount));
        }
        
        remaining = remaining - walletAmount;
      }
      
      distribution.push(walletAmount);
    }
    
    // Shuffle again using secure random
    for (let i = distribution.length - 1; i > 0; i--) {
      const j = Math.floor(getSecureRandom() * (i + 1));
      [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
    }
  }

  // Calculate statistics
  const stats = {
    total: parseFloat(distribution.reduce((sum, val) => sum + val, 0).toFixed(decimals)),
    average: parseFloat((distribution.reduce((sum, val) => sum + val, 0) / wallets).toFixed(decimals)),
    min: Math.min(...distribution),
    max: Math.max(...distribution),
    unique: new Set(distribution).size
  };

  // Remove trailing zeros from stats
  stats.total = parseFloat(stats.total);
  stats.average = parseFloat(stats.average);

  // Validate uniqueness if required
  if (unique && stats.unique < wallets) {
    // This should not happen with the new logic, but add as a safety check
    console.error(chalk.red(`Error: Failed to generate all unique values. This should not happen.`));
    console.error(chalk.red(`Please report this issue with your parameters.`));
    process.exit(1);
  }

  // Save to file
  try {
    if (format === 'json') {
      const jsonData = {
        metadata: {
          timestamp: timestamp,
          totalAmount: amount,
          wallets: wallets,
          decimals: decimals,
          minAmount: minAmount,
          maxAmount: maxAmount,
          uniqueValues: unique
        },
        statistics: stats,
        distribution: distribution
      };
      await writeFileAtomic(filename, JSON.stringify(jsonData, null, 2));
    } else {
      // TXT format - one value per line, no headers or comments
      const txtContent = distribution.join('\n') + '\n';
      await fs.promises.writeFile(filename, txtContent);
    }

    // Display statistics
    console.log(chalk.bold(`\n≡ Statistics:`));
    console.log(chalk.dim(`  Total: ${chalk.cyan(stats.total)} (target: ${amount})`));
    console.log(chalk.dim(`  Average: ${chalk.cyan(stats.average)}`));
    console.log(chalk.dim(`  Min value: ${chalk.cyan(stats.min)}`));
    console.log(chalk.dim(`  Max value: ${chalk.cyan(stats.max)}`));
    console.log(chalk.dim(`  Unique values: ${chalk.cyan(stats.unique + '/' + wallets)}`));
    
    // Display success message
    console.log(chalk.green(`\n✔ Distribution generated successfully!`));
    
    // Display file save confirmation
    console.log(chalk.cyan(`\nResults saved to: ${chalk.white(filename)}\n`));

  } catch (err) {
    console.error(chalk.red(`Error saving distribution: ${err.message}`));
    process.exit(1);
  }
};

// Worker thread code - runs in separate thread context
if (!isMainThread) {
  const {prefix, suffix, collectStats, blacklist, outputPrivateKeys, isRandomGeneration, targetCount} = workerData;
  let totalAddressesGenerated = 0;
  let shouldShutdown = false;
  let foundCount = 0; // Track found addresses for random generation
  let hasReceivedShutdown = false; // Track if we've received shutdown message

  // Initialize performance tracking with bounded arrays
  const performanceMetrics = collectStats ? {
    total: [],
    seed: [],
    derive: [],
    keypair: [],
    maxSamples: CONFIG.PERFORMANCE_SAMPLE_SIZE
  } : null;

  // Listen for shutdown message from main thread
  parentPort.on('message', (message) => {
    if (message.type === 'shutdown' && !hasReceivedShutdown) {
      hasReceivedShutdown = true;
      shouldShutdown = true;
    }
  });

  /**
   * Generates a keypair from a mnemonic phrase
   * Tracks performance metrics if enabled
   * @param {string} mnemonic - BIP39 mnemonic phrase
   * @returns {Keypair} Solana keypair
   */
  const generateKeypairFromMnemonic = (mnemonic) => {
    const startTotal = collectStats ? performance.now() : 0;

    // Step 1: Convert mnemonic to seed
    const startSeed = collectStats ? performance.now() : 0;
    const seed = bip39.mnemonicToSeed(mnemonic);
    const seedTime = collectStats ? performance.now() - startSeed : 0;

    // Step 2: Derive key using HD path
    const startDerive = collectStats ? performance.now() : 0;
    const derivedPath = "m/44'/501'/0'/0'";
    const derivedSeed = derivePath(derivedPath, Buffer.from(seed).toString('hex')).key;
    const deriveTime = collectStats ? performance.now() - startDerive : 0;

    // Step 3: Create keypair
    const startKeypair = collectStats ? performance.now() : 0;
    const keypair = Keypair.fromSeed(derivedSeed);
    const keypairTime = collectStats ? performance.now() - startKeypair : 0;

    const totalTime = collectStats ? performance.now() - startTotal : 0;

    // Track performance metrics with bounded arrays
    if (collectStats) {
      // Remove oldest sample if at capacity
      if (performanceMetrics.total.length >= performanceMetrics.maxSamples) {
        performanceMetrics.total.shift();
        performanceMetrics.seed.shift();
        performanceMetrics.derive.shift();
        performanceMetrics.keypair.shift();
      }

      // Add new sample
      performanceMetrics.total.push(totalTime);
      performanceMetrics.seed.push(seedTime);
      performanceMetrics.derive.push(deriveTime);
      performanceMetrics.keypair.push(keypairTime);

      // Report averages when buffer is full
      if (performanceMetrics.total.length === performanceMetrics.maxSamples) {
        const avgTotal = performanceMetrics.total.reduce((a, b) => a + b, 0) / performanceMetrics.total.length;
        const avgSeed = performanceMetrics.seed.reduce((a, b) => a + b, 0) / performanceMetrics.seed.length;
        const avgDerive = performanceMetrics.derive.reduce((a, b) => a + b, 0) / performanceMetrics.derive.length;
        const avgKeypair = performanceMetrics.keypair.reduce((a, b) => a + b, 0) / performanceMetrics.keypair.length;

        // Send performance report to main thread
        parentPort.postMessage({
          type: 'performance',
          metrics: {
            total: avgTotal,
            seed: avgSeed,
            derive: avgDerive,
            keypair: avgKeypair
          }
        });

        // Clear arrays for next batch
        performanceMetrics.total = [];
        performanceMetrics.seed = [];
        performanceMetrics.derive = [];
        performanceMetrics.keypair = [];
      }
    }

    return keypair;
  };

  /**
   * Checks if an address matches the vanity pattern
   * @param {string} address - Solana address to check
   * @param {string} prefix - Required prefix
   * @param {string} suffix - Required suffix
   * @returns {boolean} True if address matches pattern
   */
  const matchesVanity = (address, prefix, suffix) => {
    if (prefix && !address.startsWith(prefix)) return false;
    if (suffix && !address.endsWith(suffix)) return false;
    return true;
  };

  /**
   * Checks if a mnemonic contains any blacklisted words
   * @param {string} mnemonic - Mnemonic phrase to check
   * @returns {boolean} True if contains blacklisted words
   */
  const containsBlacklistedWords = (mnemonic) => {
    if (!blacklist || blacklist.size === 0) return false;

    const words = mnemonic.split(' ');
    for (const word of words) {
      if (blacklist.has(word.trim().toLowerCase())) {
        return true;
      }
    }
    return false;
  };

  // Periodically report progress to main thread
  setInterval(() => {
    parentPort.postMessage({
      type: 'progress',
      total: totalAddressesGenerated
    });
  }, 500);

  // Main generation loop
  try {
    while (!shouldShutdown) {
      // Process addresses in batches
      for (let i = 0; i < CONFIG.BATCH_SIZE && !shouldShutdown; i++) {
        // Generate random mnemonic
        const mnemonic = bip39.generateMnemonic();

        // Skip if contains blacklisted words (applies to both random and vanity generation)
        if (containsBlacklistedWords(mnemonic)) {
          totalAddressesGenerated++;
          continue;
        }

        // Generate keypair
        const keypair = generateKeypairFromMnemonic(mnemonic);
        const address = keypair.publicKey.toString();

        totalAddressesGenerated++;

        // For random generation mode, every address (that passes blacklist) is a match
        // For vanity mode, check if it matches the pattern
        const isMatch = isRandomGeneration ? true : matchesVanity(address, prefix, suffix);

        if (isMatch) {
          // Convert to private key if requested
          let privateKey = null;
          if (outputPrivateKeys) {
            privateKey = bs58.encode(keypair.secretKey);
          }

          // Send result to main thread (only if not shutting down)
          if (!shouldShutdown) {
            parentPort.postMessage({
              type: 'result',
              address,
              mnemonic,
              privateKey
            });

            foundCount++;
            
            // For random generation, check if we've reached the target
            if (isRandomGeneration && foundCount >= targetCount) {
              shouldShutdown = true;
              break;
            }
          }
        }
      }

      // Yield to event loop to handle messages
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (error) {
    // Report errors to main thread
    parentPort.postMessage({type: 'error', error: error.message});
  }

  // Clean exit
  process.exit(0);
}

// Main thread entry point
if (isMainThread) {
  // Display application banner
  console.log(chalk.cyan(`
________     ________    __             __________         
__  ___/________  /_ |  / /_____ __________(_)_  /_____  __
_____ \\_  __ \\_  /__ | / /_  __ \`/_  __ \\_  /_  __/_  / / /
____/ // /_/ /  / __ |/ / / /_/ /_  / / /  / / /_ _  /_/ / 
/____/ \\____//_/  _____/  \\__,_/ /_/ /_//_/  \\__/ _\\__, /  
A high-performance Solana vanity address generator/____/   
  `));

  // Configure command-line interface
  const program = new Command();

  program
    .name('solvanity')
    .description('A high-performance Solana vanity address generator CLI built with Bun')
    .version(version)
    .addHelpText('after', `
${chalk.bold('Quick Start:')}
  $ solvanity -p sol                    Generate address starting with "sol"
  $ solvanity -p abc -n 5               Generate 5 addresses with prefix "abc"
  $ solvanity distribute -a 1000 -w 10  Distribute 1000 tokens to 10 wallets

${chalk.bold('Important Notes:')}
  • Prefix/suffix max length: ${chalk.cyan('7 characters')}
  • Base58 only (excludes: ${chalk.yellow('0, O, I, l')})
  • Output directory: ${chalk.cyan('address/')}
  • Mnemonic phrases grant full wallet access - ${chalk.red('keep them secure!')}

${chalk.bold('Documentation:')}
  README:   Full usage guide and examples
  SECURITY: Security best practices and audit guide
  GitHub:   https://github.com/definesystems/solvanity
`);

  // Generate command (default)
  program
    .command('generate', { isDefault: true })
    .description('Generate Solana vanity addresses')
    .option('-n, --count <number>', 'number of addresses to generate', (value) => parseInt(value), 1)
    .option('-p, --prefix <string>', 'prefix for the address', '')
    .option('-x, --suffix <string>', 'suffix for the address', '')
    .option('-s, --stats', 'show performance statistics', false)
    .option('-t, --threads <number>', 'number of worker threads', (value) => parseInt(value), os.cpus().length)
    .option('-o, --output <mode>', 'output mode: display, combined, split, or both', 'combined')
    .option('-f, --format <type>', 'file format: json or txt', 'json')
    .option('--filename <n>', 'custom filename for output')
    .option('-q, --qr', 'display QR codes for addresses', false)
    .option('-k, --privatekey', 'generate private keys instead of mnemonic phrases', false)
    .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.dim('# Generate one random address')}
  $ solvanity

  ${chalk.dim('# Generate with prefix')}
  $ solvanity -p sol
  $ solvanity -p abc -n 10

  ${chalk.dim('# Generate with suffix')}
  $ solvanity -x xyz -n 5

  ${chalk.dim('# Advanced options')}
  $ solvanity -p pay -o both -q        ${chalk.dim('# Display + save with QR codes')}
  $ solvanity -n 20 -o split -f txt    ${chalk.dim('# Split output as TXT files')}
  $ solvanity -p sol -s                ${chalk.dim('# Show performance statistics')}

${chalk.bold('Output Modes:')}
  ${chalk.cyan('display')}   - Show on screen only (no files)
  ${chalk.cyan('combined')}  - Save address + secret in one file (default)
  ${chalk.cyan('split')}     - Save address and secret in separate files
  ${chalk.cyan('both')}      - Display on screen AND save to files

${chalk.bold('Performance Tips:')}
  • 1-2 char prefix: seconds
  • 3 char prefix: 10-60 seconds
  • 4 char prefix: 5-30 minutes
  • 5+ char prefix: hours to days
`)
    .action(async (options) => {
      // Validate options
      if (options.count < 1 || isNaN(options.count)) {
        console.error(chalk.red('Error: Count must be a positive number'));
        process.exit(1);
      }

      if (options.threads <= 0 || isNaN(options.threads)) {
        console.error(chalk.red('Error: Thread count must be a positive number'));
        process.exit(1);
      }

      if (options.threads) {
        const cpuCount = os.cpus().length;
        const maxRecommendedThreads = cpuCount * CONFIG.THREAD_MULTIPLIER;
        
        // Check if user is trying to set threads for random generation
        if (!options.prefix && !options.suffix && options.threads !== 1) {
          // This message will be shown later, after the main info output
        } else if (options.threads > maxRecommendedThreads) {
          console.warn(chalk.yellow(`Note: You're using ${options.threads} threads. Recommended maximum for your ${cpuCount}-core CPU is ${maxRecommendedThreads}.`));
        }
      }

      if (!['display', 'combined', 'split', 'both'].includes(options.output)) {
        console.error(chalk.red('Error: Output mode must be "display", "combined", "split", or "both"'));
        process.exit(1);
      }

      if (!['json', 'txt'].includes(options.format)) {
        console.error(chalk.red('Error: Format must be "json" or "txt"'));
        process.exit(1);
      }

      // Execute address generation
      await generateVanityAddresses(options);
    });

  // Split command
  program
    .command('split <file>')
    .description('Split a file into separate address and mnemonic/private key files')
    .option('-f, --format <type>', 'output file format: json or txt (defaults to input format)')
    .option('-k, --privatekey', 'convert mnemonics to private keys when splitting', false)
    .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.dim('# Split combined file into addresses and mnemonics')}
  $ solvanity split address/1234567890-address.json

  ${chalk.dim('# Split and convert mnemonics to private keys')}
  $ solvanity split address/my-addresses.json -k

  ${chalk.dim('# Split with specific output format')}
  $ solvanity split address/addresses.json -f txt

${chalk.bold('What it does:')}
  Takes a combined file (address + mnemonic) and creates two separate files:
  • ${chalk.cyan('TIMESTAMP-address.json')} - Public addresses only
  • ${chalk.cyan('TIMESTAMP-secret-mnemonics.json')} - Mnemonic phrases

  With ${chalk.yellow('-k')} flag:
  • ${chalk.cyan('TIMESTAMP-secret-privatekeys.json')} - Private keys instead
`)
    .action(async (file, options) => {
      await splitFile(file, options);
    });

  // Convert command
  program
    .command('convert <file> [targetFormat]')
    .description('Convert between json and txt formats')
    .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.dim('# Convert JSON to TXT')}
  $ solvanity convert address/addresses.json txt

  ${chalk.dim('# Convert TXT to JSON')}
  $ solvanity convert address/addresses.txt json

  ${chalk.dim('# Auto-detect target format')}
  $ solvanity convert address/addresses.json

${chalk.bold('Format Differences:')}
  ${chalk.cyan('JSON')} - Structured data with metadata (default)
  ${chalk.cyan('TXT')}  - Plain text, one entry per line
           Combined: address:mnemonic
           Split:    address or mnemonic only
`)
    .action(async (file, targetFormat) => {
      if (targetFormat && !['json', 'txt'].includes(targetFormat.toLowerCase())) {
        console.error(chalk.red('Error: Target format must be "json" or "txt"'));
        process.exit(1);
      }
      await convertFile(file, targetFormat ? targetFormat.toLowerCase() : null);
    });

  // Distribute command
  program
    .command('distribute')
    .description('Generate random token distribution across wallets')
    .requiredOption('-a, --amount <number>', 'total amount of tokens to distribute')
    .requiredOption('-w, --wallets <number>', 'number of wallets to distribute to')
    .option('-m, --min <number>', 'minimum amount per wallet', '0')
    .option('-M, --max <number>', 'maximum amount per wallet')
    .option('-d, --decimals <number>', 'number of decimal places (0-18)', '0')
    .option('-u, --unique', 'ensure unique values for each wallet', false)
    .option('-f, --format <type>', 'output format: json or txt', 'json')
    .option('-v, --verbose', 'show detailed generation process', false)
    .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.dim('# Basic distribution')}
  $ solvanity distribute -a 1000 -w 10

  ${chalk.dim('# With min/max constraints')}
  $ solvanity distribute -a 5000 -w 50 --min 50 --max 150

  ${chalk.dim('# With decimal precision')}
  $ solvanity distribute -a 100 -w 20 -d 2

  ${chalk.dim('# All unique values (no duplicates)')}
  $ solvanity distribute -a 1000 -w 25 --unique

  ${chalk.dim('# Complex distribution')}
  $ solvanity distribute -a 10000 -w 100 --min 50 --max 200 -d 4 --unique -f txt

${chalk.bold('Use Cases:')}
  • Plan token airdrops and allocations
  • Generate test distribution data
  • Create randomized wallet allocations
  • Simulate token distribution scenarios

${chalk.bold('Key Features:')}
  • Sum of all values exactly equals total amount
  • Cryptographically secure randomness
  • Respects min/max constraints
  • Variable decimal precision (0-18 decimals)
  • Optional unique values guarantee
`)
    .action(async (options) => {
      await distributeTokens(options);
    });

  // Parse command-line arguments
  program.parse(process.argv);
}