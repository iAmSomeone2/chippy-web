import type Display from "./rendering";

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

    constructor(display: Display) {
        this.display = display;
        this.sp = this.stack.length - 1;
        this.loadFontData();

        this.display.clear();
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
        this.loadFontData();

        this.display.clear();
    }

    public loadROM(rom: Uint8Array) {
        const readSize = rom.length <= Chip8.MAX_ROM_SIZE ? rom.length : Chip8.MAX_ROM_SIZE;

        for (let i = 0; i < readSize; i++) {
            const writeLoc = Chip8.START_ADDR + i;
            this.memory[writeLoc] = rom[i];
        }
    }
}