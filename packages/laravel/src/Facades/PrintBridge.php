<?php

namespace PrintBridge\Laravel\Facades;

use Illuminate\Support\Facades\Facade;
use PrintBridge\Laravel\EscPos;
use PrintBridge\Laravel\PrintJob;

/**
 * @method static PrintJob job(?string $printer = null)
 * @method static EscPos escpos()
 * @method static array connectOptions()
 * @method static string scriptUrl()
 * @method static \Illuminate\Support\HtmlString scriptTag(array $options = [])
 * @method static \Illuminate\Support\HtmlString configScript()
 * @method static mixed config(?string $key = null, mixed $default = null)
 *
 * @see \PrintBridge\Laravel\PrintBridgeManager
 */
class PrintBridge extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return 'printbridge';
    }
}
