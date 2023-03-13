<script lang="ts">
    import Chip8 from "$lib/emulator";
    import { onMount } from "svelte";
    import Display from "../lib/rendering";

    let canvas: HTMLCanvasElement;
    let filePicker: HTMLInputElement;
    let display: Display;
    let chip8: Chip8 | null = null;

    async function handleROMFile(ev: Event) {
        if (!chip8) {
            console.error("Emulator must be constructed before loading ROM");
            return;
        }

        const fileInput = ev.currentTarget as HTMLInputElement;
        const romFile = fileInput.files?.item(0);
        if (!romFile) {
            return;
        }

        try {
            const romData = new Uint8Array(await romFile.arrayBuffer());
            chip8.loadROM(romData);
        } catch (reason) {
            console.error(`Failed to load ROM file: ${reason}`);
            return;
        }

        console.log(`Loaded ROM: ${romFile.name}`);
        console.dir(chip8);
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
