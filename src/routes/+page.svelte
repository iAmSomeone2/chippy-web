<script lang="ts">
    import Chip8 from "$lib/emulator";
    import { onMount } from "svelte";
    import Display from "../lib/rendering";

    let canvas: HTMLCanvasElement;
    let filePicker: HTMLInputElement;
    let resetButton: HTMLButtonElement;
    let romFile: File | null = null;
    let display: Display;
    let chip8: Chip8 | null = null;

    function runEmu() {
        if (!chip8) {
            console.error("Emulator must be constructed to run");
            return;
        }

        setInterval(() => {
            chip8?.step();
        }, 1000 / Chip8.DEFAULT_IPS);
    }

    async function loadROM() {
        try {
            const romData = new Uint8Array(await romFile!!.arrayBuffer());
            chip8?.loadROM(romData);
        } catch (reason) {
            console.error(`Failed to load ROM file: ${reason}`);
            return;
        }

        console.log(`Loaded ROM: ${romFile?.name}`);
        runEmu();
    }

    async function handleROMFile(ev: Event) {
        if (!chip8) {
            console.error("Emulator must be constructed before loading ROM");
            return;
        }

        const fileInput = ev.currentTarget as HTMLInputElement;
        romFile = fileInput.files?.item(0) ?? null;
        if (!romFile) {
            return;
        }

        await loadROM();
    }

    function initInputCapture() {
        document.addEventListener('keydown', (keyEv) => {
            if (keyEv.isComposing || keyEv.keyCode === 229) {
                return;
            }

            chip8?.handleKeyDown(keyEv.code);
        });

        document.addEventListener('keyup', (keyEv) => {
            if (keyEv.isComposing || keyEv.keyCode === 229) {
                return;
            }

            chip8?.handleKeyUp(keyEv.code);
        });
    }

    onMount( async () => {
        filePicker.addEventListener("change", handleROMFile);
        
        try {
            display = Display.createForCanvas(canvas);
        } catch (err) {
            alert(err);
        }

        await display.initialize();
        display.render();

        chip8 = new Chip8(display);
        // Enable filePicker now that the emulator is constructed
        filePicker.disabled = false;

        initInputCapture();

        resetButton.addEventListener('click', async (_ev) => {
            chip8?.reset();
            await loadROM();
        });
    });
</script>

<div id="emu" class="flex-row">
    <div class="spacer"></div>
    <div id="ui" class="flex-col">
        <canvas bind:this={canvas} width="128px" height="64px"></canvas>
        <div class="flex-row">
            <input
                bind:this={filePicker}
                disabled
                type="file"
                id="rom-picker"
                accept=".bin,.ch8,application/octet-stream" />
            <div class="spacer"></div>
            <button bind:this={resetButton}>Reset</button>
        </div>
        <div class="spacer"></div>
    </div>
    <div class="spacer"></div>
</div>

<style>
    .flex-row {
        display: flex;
        flex-direction: row;
    }

    .flex-col {
        display: flex;
        flex-direction: column;
    }

    #emu {
        color: #afafaf;
    }

    #rom-picker {
        padding: 0.5em;
    }

    #ui {
        flex: 2;
        min-width: 60%;
        padding: 0.5em;
    }

    .spacer {
        flex: 1;
    }
</style>
