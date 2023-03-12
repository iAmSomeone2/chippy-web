<script lang="ts">
    import { onMount } from "svelte";
    import Display from "../lib/rendering";

    let canvas: HTMLCanvasElement;
    let display: Display;

    onMount(() => {
        try {
            display = Display.createForCanvas(canvas);
        } catch (err) {
            alert(err);
        }

        document.onresize = (_ev) => {
            display.resizeViewport();
        };

        display.initialize()
            .then(() => {
                display.draw();
            })
            .catch((err) => {
                console.error(err);
            });
    });    
</script>

<div id="emu">
    <div class="spacer"></div>
    <canvas bind:this={canvas} width="128px" height="64px"></canvas>
    <div class="spacer"></div>
</div>

<style>
    #emu {
        display: flex;
        flex-direction: row;
    }

    canvas {
        /* border: 4px solid blue; */
        flex: 2;
    }

    .spacer {
        flex: 1;
    }
</style>
