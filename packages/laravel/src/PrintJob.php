<?php

namespace PrintBridge\Laravel;

use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Contracts\Support\Jsonable;
use JsonSerializable;

/**
 * Fluent builder for a PrintBridge job. Serialises to { config, data } which the
 * browser forwards verbatim: PrintBridge.print(job.config, job.data).
 */
class PrintJob implements Arrayable, Jsonable, JsonSerializable
{
    protected array $config = [];

    protected array $data = [];

    public function __construct(array $defaults = [])
    {
        if (! empty($defaults['encoding'])) {
            $this->config['encoding'] = $defaults['encoding'];
        }
    }

    /* ---------- target ---------- */

    public function printer(?string $name): static
    {
        if ($name !== null) {
            $this->config['printer'] = $name;
        }

        return $this;
    }

    /** Network printer, raw TCP (JetDirect / port 9100). */
    public function network(string $host, int $port = 9100): static
    {
        unset($this->config['printer']);
        $this->config['host'] = $host;
        $this->config['port'] = $port;

        return $this;
    }

    /** Device path, e.g. /dev/usb/lp0 */
    public function device(string $path): static
    {
        unset($this->config['printer']);
        $this->config['file'] = $path;

        return $this;
    }

    /* ---------- options ---------- */

    public function copies(int $n): static
    {
        $this->config['copies'] = $n;

        return $this;
    }

    public function encoding(string $codepage): static
    {
        $this->config['encoding'] = $codepage;

        return $this;
    }

    /** Page size for HTML/PDF, in mm by default. */
    public function size(float $width, float $height, string $units = 'mm'): static
    {
        $this->config['size'] = ['width' => $width, 'height' => $height];
        $this->config['units'] = $units;

        return $this;
    }

    public function landscape(): static
    {
        $this->config['orientation'] = 'landscape';

        return $this;
    }

    public function noMargins(): static
    {
        $this->config['margins'] = 0;

        return $this;
    }

    /** Render HTML to PDF before printing (most predictable for receipts). */
    public function viaPdf(): static
    {
        $this->config['via'] = 'pdf';

        return $this;
    }

    public function option(string $key, mixed $value): static
    {
        $this->config[$key] = $value;

        return $this;
    }

    /* ---------- data ---------- */

    /** Raw bytes / ESC-POS. Accepts an EscPos builder, a string, or a ready item array. */
    public function raw(EscPos|string|array $data, string $format = 'plain'): static
    {
        if ($data instanceof EscPos) {
            $this->data[] = $data->toItem();
        } elseif (is_array($data)) {
            $this->data[] = $data + ['type' => 'raw'];
        } else {
            $this->data[] = ['type' => 'raw', 'format' => $format, 'data' => $data];
        }

        return $this;
    }

    public function rawBase64(string $base64): static
    {
        return $this->raw(['format' => 'base64', 'data' => $base64]);
    }

    public function html(string $html): static
    {
        $this->data[] = ['type' => 'pixel', 'format' => 'html', 'flavor' => 'plain', 'data' => $html];

        return $this;
    }

    /** Render a Blade view to HTML for printing. */
    public function view(string $view, array $data = []): static
    {
        return $this->html(view($view, $data)->render());
    }

    public function htmlUrl(string $url): static
    {
        $this->data[] = ['type' => 'pixel', 'format' => 'html', 'flavor' => 'url', 'data' => $url];

        return $this;
    }

    /** PDF from binary contents. */
    public function pdf(string $binary): static
    {
        $this->data[] = ['type' => 'pixel', 'format' => 'pdf', 'flavor' => 'base64', 'data' => base64_encode($binary)];

        return $this;
    }

    public function pdfBase64(string $base64): static
    {
        $this->data[] = ['type' => 'pixel', 'format' => 'pdf', 'flavor' => 'base64', 'data' => $base64];

        return $this;
    }

    public function pdfUrl(string $url): static
    {
        $this->data[] = ['type' => 'pixel', 'format' => 'pdf', 'flavor' => 'url', 'data' => $url];

        return $this;
    }

    public function image(string $binaryPng): static
    {
        $this->data[] = ['type' => 'pixel', 'format' => 'image', 'flavor' => 'base64', 'data' => base64_encode($binaryPng)];

        return $this;
    }

    /* ---------- output ---------- */

    public function toArray(): array
    {
        return ['config' => $this->config, 'data' => $this->data];
    }

    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    public function toJson($options = 0): string
    {
        return json_encode($this->toArray(), $options);
    }
}
