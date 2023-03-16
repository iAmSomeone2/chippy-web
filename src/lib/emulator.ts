import Display from "./rendering";

enum ArgLayout {
    XNN,
    XYZ,
}

enum Keypad {
    Key1 = 0x1, Key2 = 0x2, Key3 = 0x3, KeyC = 0xC,
    Key4 = 0x4, Key5 = 0x5, Key6 = 0x6, KeyD = 0xD,
    Key7 = 0x7, Key8 = 0x8, Key9 = 0x9, KeyE = 0xE,
    KeyA = 0xA, Key0 = 0x0, KeyB = 0xB, KeyF = 0xF
}

const inputMap = new Map<string, Keypad>([
    ['Digit1', Keypad.Key1], ['Digit2', Keypad.Key2], ['Digit3', Keypad.Key3], ['Digit4', Keypad.KeyC],
    ['KeyQ', Keypad.Key4],   ['KeyW', Keypad.Key5],   ['KeyE', Keypad.Key6],   ['KeyR', Keypad.KeyD],
    ['KeyA', Keypad.Key7],   ['KeyS', Keypad.Key8],   ['KeyD', Keypad.Key9],   ['KeyF', Keypad.KeyE],
    ['KeyZ', Keypad.KeyA],   ['KeyX', Keypad.Key0],   ['KeyC', Keypad.KeyB],   ['KeyV', Keypad.KeyF],
]);

const INSTRUCTION_SIZE = 2;
const UINT8_MAX = 255;

/** Font character data */
const FONT_DATA = new Uint8Array([
    0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
    0x20, 0x60, 0x20, 0x20, 0x70, // 1
    0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
    0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
    0x90, 0x90, 0xF0, 0x10, 0x10, // 4
    0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
    0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
    0xF0, 0x10, 0x20, 0x40, 0x40, // 7
    0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
    0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
    0xF0, 0x90, 0xF0, 0x90, 0x90, // A
    0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
    0xF0, 0x80, 0x80, 0x80, 0xF0, // C
    0xE0, 0x90, 0x90, 0x90, 0xE0, // D
    0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
    0xF0, 0x80, 0xF0, 0x80, 0x80, // F
]);

/** Number of bytes in a single font character */
const FONT_CHAR_WIDTH = 5;

export default class Chip8 {
    /** Default number of instructions per second */
    public static readonly DEFAULT_IPS = 500;

    private static readonly MEM_SIZE = 4096;
    private static readonly MAX_ROM_SIZE = 3232;

    /** Program start location */
    private static readonly START_ADDR = 0x200;

    private static readonly STACK_SIZE = 16;

    /** Target display */
    private display: Display;

    /** Program counter */
    private pc: number = Chip8.START_ADDR;
    /** Index register */
    private i: number = 0;
    /** V registers */
    private v: Uint8Array = new Uint8Array(16);
    /** Call stack */
    private stack: Uint16Array = new Uint16Array(Chip8.STACK_SIZE);
    /** Stack pointer */
    private sp: number;

    private delayTimer: number = 0;
    private soundTimer: number = 0;

    /** System memory */
    private memory: Uint8Array = new Uint8Array(Chip8.MEM_SIZE);

    // Input handling state
    private awaitingKey = false;
    private keypadRegister: number | null = null;
    private pressedKeys = new Set<Keypad>();

    // Audio output state
    private audioCtx: AudioContext = new AudioContext({latencyHint: 'interactive'});
    private buzzer: OscillatorNode | null = null;
    private isBuzzing = false;

    constructor(display: Display) {
        this.display = display;
        this.sp = this.stack.length - 1;
        this.loadFontData();

        this.display.clear();

        setInterval(() => {
            this.decrementTimers();
        }, 1000 / 60);
    }

    private startBuzzer() {
        this.buzzer = this.audioCtx.createOscillator();
        this.buzzer.type = 'square';
        this.buzzer.connect(this.audioCtx.destination);
        this.buzzer.start();

        this.isBuzzing = true;
    }

    private stopBuzzer() {
        this.buzzer?.stop();
        this.buzzer = null;

        this.isBuzzing = false;
    }

    private loadFontData() {
        for (let i = 0; i < FONT_DATA.length; i++) {
            this.memory[i] = FONT_DATA[i];
        }
    }

    public reset() {
        this.delayTimer = 0;
        this.soundTimer = 0;

        this.v = new Uint8Array(16);
        this.stack = new Uint16Array(Chip8.STACK_SIZE);
        this.sp = this.stack.length - 1;
        this.memory = new Uint8Array(Chip8.MEM_SIZE);
        this.pc = Chip8.START_ADDR;
        this.i = 0;
        this.awaitingKey = false;
        this.keypadRegister = null;
        this.pressedKeys = new Set<Keypad>();
        this.loadFontData();

        if (this.isBuzzing) {
            this.stopBuzzer();
        }

        this.display.clear();
    }

    /**
     * Loads a ROM binary into EMU memory
     * @param rom binary ROM data
     */
    public loadROM(rom: Uint8Array) {
        this.reset();
        const readSize = rom.length <= Chip8.MAX_ROM_SIZE ? rom.length : Chip8.MAX_ROM_SIZE;

        for (let i = 0; i < readSize; i++) {
            const writeLoc = Chip8.START_ADDR + i;
            this.memory[writeLoc] = rom[i];
        }
    }

    public handleKeyDown(code: string) {
        const keypad = inputMap.get(code);
        if (keypad === undefined) {
            return;
        }

        this.pressedKeys.add(keypad);

        if (this.awaitingKey && this.keypadRegister) {
            this.v[this.keypadRegister] = keypad;
            this.awaitingKey = false;
            this.keypadRegister = null;
        }
    }

    public handleKeyUp(code: string) {
        const keypad = inputMap.get(code);
        if (!keypad) {
            return;
        }

        this.pressedKeys.delete(keypad);
    }

    /**
     * Decrements the delay and sound timers.
     */
    private decrementTimers() {
        if (this.delayTimer > 0) {
            this.delayTimer -= 1;
        }

        if (this.soundTimer > 0) {
            this.soundTimer -= 1;
        } else {
            if (this.isBuzzing) {
                this.stopBuzzer();
            }
        }
    }

    /**
     * Reads a 16-bit value from memory where PC indicates.
     * 
     * PC is incremented by 2
     */
    private readWord(): number {
        const byte0 = this.memory[this.pc];
        const byte1 = this.memory[this.pc+1];
        this.pc += INSTRUCTION_SIZE;

        // Reset PC to the start address if it goes past 0x1000;
        if (this.pc >= 0x1000) {
            this.pc = Chip8.START_ADDR;
        }

        return byte0 << 8 | byte1;
    }

    /**
     * 
     * @param argLayout layout of argument values
     */
    private static splitArgs(args: number, argLayout: ArgLayout): number[] {
        switch(argLayout) {
            case ArgLayout.XNN:
                const register = (args >> 8) & 0xF;
                const immediate = args & 0xFF;
                return [register, immediate];
            case ArgLayout.XYZ:
                const regX = (args >> 8) & 0xF;
                const regY = (args >> 4) & 0xF;
                const z = args & 0xF;
                return [regX, regY, z];
        }
    }

    private callSubroutine(args: number) {
        // Push current addr onto the stack
        this.stack[this.sp] = this.pc;
        this.sp -= 1;

        // Set program counter
        this.pc = args;
    }

    private returnFromSubroutine() {
        // Pop return addr from stack
        this.sp += 1;
        this.pc = this.stack[this.sp];
    }

    private setRegister(args: number) {
        const [regIdx, immediate] = Chip8.splitArgs(args, ArgLayout.XNN);
        this.v[regIdx] = immediate;
    }

    private addToRegister(args: number) {
        const [regIdx, immediate] = Chip8.splitArgs(args, ArgLayout.XNN);
        this.v[regIdx] += immediate;
    }

    private bitAndMathOps(args: number) {
        const [idxX, idxY, z] = Chip8.splitArgs(args, ArgLayout.XYZ);

        switch(z) {
            case 0x0:
                this.v[idxX] = this.v[idxY];
                break;
            case 0x1:
                this.v[idxX] |= this.v[idxY];
                break;
            case 0x2:
                this.v[idxX] &= this.v[idxY];
                break;
            case 0x3:
                this.v[idxX] ^= this.v[idxY];
                break;
            case 0x4:
                this.v[idxX] += this.v[idxY];
                if (this.v[idxX] > UINT8_MAX) {
                    // Carry result and set VF
                    this.v[idxX] - UINT8_MAX;
                    this.v[0xF] = 1;
                }
                break;
            case 0x5:
                this.v[idxX] -= this.v[idxY];
                if (this.v[idxX] < 0) {
                    // Borrow result and set VF
                    this.v[0xF] = 0;
                    this.v[idxX] = UINT8_MAX + this.v[idxX];
                } else {
                    // Only set VF
                    this.v[0xF] = 1;
                }
                break;
            case 0x6:
                this.v[0xF] = this.v[idxX] & 0b1;
                this.v[idxX] >>= 1;
                break;
            case 0x7:
                this.v[idxX] = this.v[idxY] - this.v[idxX];
                if (this.v[idxX] < 0) {
                    // Borrow result and set VF
                    this.v[0xF] = 0;
                    this.v[idxX] = UINT8_MAX + this.v[idxX];
                } else {
                    // Only set VF
                    this.v[0xF] = 1;
                }
                break;
            case 0xE:
                this.v[0xF] = this.v[idxX] & 0b10000000;
                this.v[idxX] <<= 1;
                break;
            default:
                console.warn(`Unrecognized bit or math op: 0x8${args.toString(16)}`);
        }
    }

    private skipIfVXeqNN(args: number) {
        const [regIdx, immediate] = Chip8.splitArgs(args, ArgLayout.XNN);
        if (this.v[regIdx] === immediate) {
            this.pc += INSTRUCTION_SIZE;
        }
    }

    private skipIfVXneqNN(args: number) {
        const [regIdx, immediate] = Chip8.splitArgs(args, ArgLayout.XNN);
        if (this.v[regIdx] !== immediate) {
            this.pc += INSTRUCTION_SIZE;
        }
    }

    private skipIfVXeqVY(args: number) {
        const [idxX, idxY, _z] = Chip8.splitArgs(args, ArgLayout.XYZ);

        if (this.v[idxX] === this.v[idxY]) {
            this.pc += INSTRUCTION_SIZE;
        }
    }

    /**
     * Skip next instruction if VX != VY
     * @param args 
     */
    private skipIfVXneqVY(args: number) {
        const [idxX, idxY, _z] = Chip8.splitArgs(args, ArgLayout.XYZ);

        if (this.v[idxX] !== this.v[idxY]) {
            this.pc += INSTRUCTION_SIZE;
        }
    }

    private randByte(args: number) {
        const [regIdx, immediate] = Chip8.splitArgs(args, ArgLayout.XNN);

        let randByte = Math.random() * 255;
        randByte -= (randByte % 1);
        randByte &= immediate;

        this.v[regIdx] = randByte;
    }

    private drawSprite(args: number) {
        const [idxX, idxY, height] = Chip8.splitArgs(args, ArgLayout.XYZ);
        const x = this.v[idxX] % Display.vWidth;
        const y = this.v[idxY] % Display.vHeight;

        for (let row = 0; row < height; row++) {
            const readLoc = this.i + row;
            const spriteLine = this.memory[readLoc];
            for (let col = 0; col < 8; col++) {
                const bit = (spriteLine >> (7 - col)) & 0b1;
                const locX = x + col;
                const locY = y + row;
                if (bit === 0b1) {
                    const didUnset = this.display.toggleVPixel(locX, locY);
                    if (didUnset) {
                        this.v[0xF] = 0b1;
                    }
                }
            }
        }

        this.display.render();
    }

    private regDump(stopIdx: number) {
        for(let i = 0; i <= stopIdx; i++) {
            const writeLoc = this.i + i;
            this.memory[writeLoc] = this.v[i];
        }
    }

    private regLoad(stopIdx: number) {
        for(let i = 0; i <= stopIdx; i++) {
            const readLoc = this.i + i;
            this.v[i] = this.memory[readLoc];
        }
    }

    private setBCD(vIdx: number) {
        const num = this.v[vIdx];
        const ones = num % 10;
        const tens = ((num - ones) % 100);
        const hundreds = ((num - (tens + ones)) % 1000);

        this.memory[this.i] = hundreds / 100;
        this.memory[this.i + 1] = tens / 10;
        this.memory[this.i + 2] = ones;
    }

    private miscOps(args: number) {
        const [idxX, n] = Chip8.splitArgs(args, ArgLayout.XNN);
        switch(n) {
            case 0x07:
                // Set VX to value in delayTimer
                this.v[idxX] = this.delayTimer;
                break;
            case 0x0A:
                this.awaitingKey = true;
                this.keypadRegister = idxX;
                break;
            case 0x15:
                // Set delay timer to VX
                this.delayTimer = this.v[idxX];
                break;
            case 0x18:
                // Set sound timer to VX
                this.soundTimer = this.v[idxX];
                if (!this.isBuzzing && this.soundTimer > 0) {
                    this.startBuzzer();
                }
                break;
            case 0x1E:
                // Add VX to I
                this.i += this.v[idxX];
                break;
            case 0x29:
                // Set I to the location of the sprite for the char in VX
                this.i = this.v[idxX] * FONT_CHAR_WIDTH;
                break;
            case 0x33:
                // Store the binary-coded decimal representation of VX
                this.setBCD(idxX);
                break;
            case 0x55:
                // Dump registers to memory
                this.regDump(idxX);
                break;
            case 0x65:
                // Load registers from memory
                this.regLoad(idxX);
                break;
            default:
                console.warn(`Unrecognized misc. op: 0xF${args.toString(16)}`);
        }
    }

    private inputBranching(args: number) {
        const [idxX, n] = Chip8.splitArgs(args, ArgLayout.XNN);
        const expectedKey = this.v[idxX] as Keypad;
        switch (n) {
            case 0x9E:
                // Skips the next instruction if the key stored in VX is pressed
                if (this.pressedKeys.has(expectedKey)) {
                    this.pc += INSTRUCTION_SIZE;
                }
                break;
            case 0xA1:
                // Skips the next instruction if the key stored in VX is not pressed
                if (!this.pressedKeys.has(expectedKey)) {
                    this.pc += INSTRUCTION_SIZE;
                }
                break;
            default:
                console.warn(`Unrecognized input branch op: 0xE${args.toString(16)}`);
        }
    }

    public step() {
        if (this.awaitingKey) {
            // Skip step if awaiting keypress
            return;
        }

        const opcode = this.readWord();
        // Get first 4 bits for category
        const category = opcode >> 12;
        // Take last 12 bits for arguments
        const args = opcode & 0x0FFF;

        switch (category) {
            case 0x0:
                switch (args) {
                    case 0x0E0:
                        // Clear display
                        this.display.clear();
                        break;
                    case 0x0EE:
                        // Return from subroutine
                        this.returnFromSubroutine();
                        break;
                    default:
                        console.warn(`Unrecognized opcode: 0x${opcode.toString(16)}`);
                }
                break;
            case 0x1:
                // Jumps to address specified by args
                this.pc = args;
                break;
            case 0x2:
                // Jump to subroutine
                this.callSubroutine(args);
                break;
            case 0x3:
                this.skipIfVXeqNN(args);
                break;
            case 0x4:
                this.skipIfVXneqNN(args);
                break;
            case 0x5:
                this.skipIfVXeqVY(args);
                break;
            case 0x6:
                // Sets VX to NN;
                this.setRegister(args);
                break;
            case 0x7:
                // Adds NN to VX;
                this.addToRegister(args);
                break;
            case 0x8:
                // Register-based bit operations
                this.bitAndMathOps(args);
                break;
            case 0x9:
                // Skip next instruction if VX != VY
                this.skipIfVXneqVY(args);
                break;
            case 0xA:
                // Set I to immediate value (args)
                this.i = args;
                break;
            case 0xB:
                // Jump to address NNN (args) plus V0
                this.pc = this.v[0x0] + args;
                break;
            case 0xC:
                // Set VX to a random number
                this.randByte(args);
                break;
            case 0xD:
                // Draw sprite
                this.drawSprite(args);
                break;
            case 0xE:
                // Branch on inpu
                this.inputBranching(args);
                break;
            case 0xF:
                // Misc. ops
                this.miscOps(args);
                break;
            default:
                console.warn(`Unrecognized opcode: 0x${opcode.toString(16)}`);
        }
    }
}