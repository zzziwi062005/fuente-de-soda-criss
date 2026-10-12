export const JAVA_SOURCE_FILES: { filename: string; title: string; code: string }[] = [
  {
    filename: 'TipoCliente.java',
    title: 'Enum TipoCliente',
    code: `package com.fuentedesoda.criss;

/**
 * Modalidad de cliente o destino del almuerzo.
 */
public enum TipoCliente {
    MESA("Comedor en Mesa"),
    TIENDA("Venta a Tiendas / Para Llevar");

    private final String descripcion;

    TipoCliente(String descripcion) {
        this.descripcion = descripcion;
    }

    public String getDescripcion() {
        return descripcion;
    }
}
`,
  },
  {
    filename: 'TipoMenu.java',
    title: 'Enum TipoMenu',
    code: `package com.fuentedesoda.criss;

/**
 * Tipo de almuerzo servido.
 */
public enum TipoMenu {
    MENU_CON_ENTRADA("Menú Completo con Entrada"),
    SOLO_SEGUNDO("Solo Segundo");

    private final String descripcion;

    TipoMenu(String descripcion) {
        this.descripcion = descripcion;
    }

    public String getDescripcion() {
        return descripcion;
    }
}
`,
  },
  {
    filename: 'Tarifario.java',
    title: 'Reglas de Precios',
    code: `package com.fuentedesoda.criss;

/**
 * Reglas de precios exactas de "Fuente de Soda Criss":
 * - Mesa: Menú con entrada = 13.00 soles | Solo segundo = 12.00 soles
 * - Tienda: Menú con entrada = 12.00 soles | Solo segundo = 11.00 soles
 */
public class Tarifario {

    public static double obtenerPrecioUnitario(TipoCliente tipoCliente, TipoMenu tipoMenu) {
        if (tipoCliente == TipoCliente.MESA) {
            return (tipoMenu == TipoMenu.MENU_CON_ENTRADA) ? 13.00 : 12.00;
        } else { // TIENDA
            return (tipoMenu == TipoMenu.MENU_CON_ENTRADA) ? 12.00 : 11.00;
        }
    }
}
`,
  },
  {
    filename: 'Almuerzo.java',
    title: 'Clase Almuerzo',
    code: `package com.fuentedesoda.criss;

public class Almuerzo {
    private TipoCliente tipoCliente;
    private TipoMenu tipoMenu;
    private String entrada;
    private String segundo;
    private int cantidad;
    private double precioUnitario;
    private String notas;

    public Almuerzo(TipoCliente tipoCliente, TipoMenu tipoMenu, String entrada, String segundo, int cantidad, String notas) {
        this.tipoCliente = tipoCliente;
        this.tipoMenu = tipoMenu;
        this.entrada = entrada;
        this.segundo = segundo;
        this.cantidad = cantidad;
        this.notas = notas;
        this.precioUnitario = Tarifario.obtenerPrecioUnitario(tipoCliente, tipoMenu);
    }

    public double getSubtotal() {
        return precioUnitario * cantidad;
    }

    // Getters y Setters
    public TipoCliente getTipoCliente() { return tipoCliente; }
    public TipoMenu getTipoMenu() { return tipoMenu; }
    public String getEntrada() { return entrada; }
    public String getSegundo() { return segundo; }
    public int getCantidad() { return cantidad; }
    public double getPrecioUnitario() { return precioUnitario; }
    public String getNotas() { return notas; }

    @Override
    public String toString() {
        String detalleEntrada = (tipoMenu == TipoMenu.MENU_CON_ENTRADA && entrada != null) ? " [Entrada: " + entrada + "]" : "";
        return String.format("%d x %s (%s) - S/ %.2f c/u | Total: S/ %.2f%s | Segundo: %s",
                cantidad, tipoMenu.getDescripcion(), tipoCliente.getDescripcion(),
                precioUnitario, getSubtotal(), detalleEntrada, segundo);
    }
}
`,
  },
  {
    filename: 'Extra.java',
    title: 'Clase Extra',
    code: `package com.fuentedesoda.criss;

/**
 * Representa un producto o servicio extra personalizable con descripción y precio propio.
 */
public class Extra {
    private String nombre;
    private String descripcion;
    private double precio;
    private int cantidad;

    public Extra(String nombre, String descripcion, double precio, int cantidad) {
        this.nombre = nombre;
        this.descripcion = descripcion;
        this.precio = precio;
        this.cantidad = cantidad;
    }

    public double getSubtotal() {
        return precio * cantidad;
    }

    public String getNombre() { return nombre; }
    public String getDescripcion() { return descripcion; }
    public double getPrecio() { return precio; }
    public int getCantidad() { return cantidad; }

    public void setCantidad(int cantidad) { this.cantidad = cantidad; }
    public void setPrecio(double precio) { this.precio = precio; }
    public void setDescripcion(String descripcion) { this.descripcion = descripcion; }

    @Override
    public String toString() {
        return String.format("%d x %s (S/ %.2f) - S/ %.2f [%s]",
                cantidad, nombre, precio, getSubtotal(), descripcion != null ? descripcion : "");
    }
}
`,
  },
  {
    filename: 'Comanda.java',
    title: 'Clase Comanda / Pedido',
    code: `package com.fuentedesoda.criss;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

public class Comanda {
    private int numeroPedido;
    private String ubicacionODestino; // Ej: "Mesa 3" o "Tienda Don Pepe"
    private TipoCliente tipoCliente;
    private List<Almuerzo> almuerzos;
    private List<Extra> extras;
    private LocalDateTime fechaHora;
    private String metodoPago; // Efectivo, Yape, Plin, Pendiente
    private boolean pagado;

    public Comanda(int numeroPedido, String ubicacionODestino, TipoCliente tipoCliente) {
        this.numeroPedido = numeroPedido;
        this.ubicacionODestino = ubicacionODestino;
        this.tipoCliente = tipoCliente;
        this.almuerzos = new ArrayList<>();
        this.extras = new ArrayList<>();
        this.fechaHora = LocalDateTime.now();
        this.metodoPago = "Efectivo";
        this.pagado = false;
    }

    public void agregarAlmuerzo(Almuerzo almuerzo) {
        this.almuerzos.add(almuerzo);
    }

    public void agregarExtra(Extra extra) {
        this.extras.add(extra);
    }

    public double calcularTotal() {
        double total = 0.0;
        for (Almuerzo a : almuerzos) {
            total += a.getSubtotal();
        }
        for (Extra e : extras) {
            total += e.getSubtotal();
        }
        return total;
    }

    public void imprimirTicket() {
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
        System.out.println("=========================================");
        System.out.println("         FUENTE DE SODA CRISS            ");
        System.out.println("         Puesto de Almuerzos             ");
        System.out.println("=========================================");
        System.out.println("Comanda N°: #" + numeroPedido);
        System.out.println("Fecha/Hora: " + fechaHora.format(dtf));
        System.out.println("Destino   : " + ubicacionODestino + " (" + tipoCliente.getDescripcion() + ")");
        System.out.println("-----------------------------------------");
        System.out.println("ALMUERZOS:");
        for (Almuerzo a : almuerzos) {
            System.out.println(" - " + a);
        }
        if (!extras.isEmpty()) {
            System.out.println("-----------------------------------------");
            System.out.println("EXTRAS:");
            for (Extra e : extras) {
                System.out.println(" - " + e);
            }
        }
        System.out.println("-----------------------------------------");
        System.out.printf("TOTAL A PAGAR: S/ %.2f soles%n", calcularTotal());
        System.out.println("Método de Pago: " + metodoPago + (pagado ? " [PAGADO]" : " [PENDIENTE]"));
        System.out.println("=========================================\\n");
    }

    // Getters y Setters
    public int getNumeroPedido() { return numeroPedido; }
    public String getUbicacionODestino() { return ubicacionODestino; }
    public TipoCliente getTipoCliente() { return tipoCliente; }
    public List<Almuerzo> getAlmuerzos() { return almuerzos; }
    public List<Extra> getExtras() { return extras; }
    public LocalDateTime getFechaHora() { return fechaHora; }
    public String getMetodoPago() { return metodoPago; }
    public void setMetodoPago(String metodoPago) { this.metodoPago = metodoPago; }
    public boolean isPagado() { return pagado; }
    public void setPagado(boolean pagado) { this.pagado = pagado; }
}
`,
  },
  {
    filename: 'MainFuenteDeSodaCriss.java',
    title: 'Programa Principal (Main)',
    code: `package com.fuentedesoda.criss;

import java.util.Scanner;

/**
 * Aplicación de consola Java para Fuente de Soda Criss.
 */
public class MainFuenteDeSodaCriss {

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        int contadorPedidos = 1;

        System.out.println("**************************************************");
        System.out.println("   BIENVENIDO A FUENTE DE SODA CRISS (SISTEMA)   ");
        System.out.println("**************************************************");

        // Ejemplo rápido demostrativo
        System.out.println("\\nGenerando comanda de demostración...");

        // Pedido 1: Para mesa (Menú con entrada = S/ 13)
        Comanda comandaMesa = new Comanda(contadorPedidos++, "Mesa 2", TipoCliente.MESA);
        comandaMesa.agregarAlmuerzo(new Almuerzo(
                TipoCliente.MESA,
                TipoMenu.MENU_CON_ENTRADA,
                "Sopa de Verduras",
                "Lomo Saltado",
                1,
                "Bien frito"
        ));
        comandaMesa.agregarExtra(new Extra("Gaseosa Inka Kola", "Botella de 500ml", 3.50, 1));
        comandaMesa.setPagado(true);
        comandaMesa.imprimirTicket();

        // Pedido 2: Para tienda (Menú con entrada = S/ 12, solo segundo = S/ 11)
        Comanda comandaTienda = new Comanda(contadorPedidos++, "Tienda Don Pepe", TipoCliente.TIENDA);
        comandaTienda.agregarAlmuerzo(new Almuerzo(
                TipoCliente.TIENDA,
                TipoMenu.MENU_CON_ENTRADA,
                "Papa a la Huancaína",
                "Seco de Pollo con Frejoles",
                1,
                "Con bastante ají"
        ));
        comandaTienda.agregarAlmuerzo(new Almuerzo(
                TipoCliente.TIENDA,
                TipoMenu.SOLO_SEGUNDO,
                null,
                "Arroz Chaufa",
                1,
                "Sin cebollita china"
        ));
        comandaTienda.agregarExtra(new Extra("Porción de Plátano Frito", "Plátano maduro frito", 2.00, 1));
        comandaTienda.setMetodoPago("Yape");
        comandaTienda.setPagado(true);
        comandaTienda.imprimirTicket();

        System.out.println("Sistema Java inicializado correctamente.");
    }
}
`,
  },
  {
    filename: 'CuadernoVentas.java',
    title: 'Cuaderno Digital (Pisos, Cuentas Semanales/Diarias, Abonos)',
    code: `package com.fuentedesoda.criss;

import java.util.*;

/**
 * Cuaderno Digital de Ventas y Cobros de "Fuente de Soda Criss".
 * - Clasifica clientes por piso y tipo de cuenta (Semanal o Diaria).
 * - Registra consumos de lunes a sábado con extras.
 * - Registra abonos parciales (solamente Efectivo o Yape) con fecha y día.
 * - Contador independiente de Mesa Única de Salón.
 * - Genera estado de cuenta para cobro a fin de mes.
 */
public class CuadernoVentas {

    public enum TipoCuenta { SEMANAL, DIARIA }
    public enum MetodoPago { EFECTIVO, YAPE }

    public static class RegistroConsumo {
        public String fecha;
        public String diaSemana;
        public String detalleAlmuerzos;
        public double subtotalAlmuerzos;
        public double totalExtras;
        public double totalDia;
        public boolean pagado;
        public MetodoPago metodoPago;

        public RegistroConsumo(String fecha, String diaSemana, String detalle, double subAlm, double extras) {
            this.fecha = fecha;
            this.diaSemana = diaSemana;
            this.detalleAlmuerzos = detalle;
            this.subtotalAlmuerzos = subAlm;
            this.totalExtras = extras;
            this.totalDia = subAlm + extras;
            this.pagado = false;
        }
    }

    public static class RegistroAbono {
        public String fecha;
        public String diaSemana;
        public double monto;
        public MetodoPago metodo;
        public String nota;

        public RegistroAbono(String fecha, String diaSemana, double monto, MetodoPago metodo, String nota) {
            this.fecha = fecha;
            this.diaSemana = diaSemana;
            this.monto = monto;
            this.metodo = metodo;
            this.nota = nota;
        }
    }

    public static class ClienteCuaderno {
        public String id;
        public String nombre;
        public String piso; // "Piso 1", "Piso 2", etc.
        public TipoCuenta tipoCuenta;
        public List<RegistroConsumo> consumos = new ArrayList<>();
        public List<RegistroAbono> abonos = new ArrayList<>();

        public ClienteCuaderno(String id, String nombre, String piso, TipoCuenta tipo) {
            this.id = id;
            this.nombre = nombre;
            this.piso = piso;
            this.tipoCuenta = tipo;
        }

        public double getTotalConsumido() {
            return consumos.stream().mapToDouble(c -> c.totalDia).sum();
        }

        public double getTotalAbonado() {
            return abonos.stream().mapToDouble(a -> a.monto).sum();
        }

        public double getSaldoPendiente() {
            return Math.max(0.0, getTotalConsumido() - getTotalAbonado());
        }
    }

    // Contador de Mesa Única (Salón compartido)
    public static class ContadorMesaSalón {
        public String fecha;
        public int countMenuCompleto; // S/ 13.00 c/u
        public int countSoloSegundo;   // S/ 12.00 c/u
        public double totalExtras;
        public double cobradoEfectivo;
        public double cobradoYape;

        public double calcularTotalMesa() {
            return (countMenuCompleto * 13.0) + (countSoloSegundo * 12.0) + totalExtras;
        }
    }

    private final Map<String, ClienteCuaderno> clientes = new LinkedHashMap<>();

    public void agregarCliente(ClienteCuaderno cliente) {
        clientes.put(cliente.id, cliente);
    }

    public void registrarAbono(String clienteId, String fecha, String dia, double monto, MetodoPago metodo, String nota) {
        ClienteCuaderno c = clientes.get(clienteId);
        if (c != null) {
            c.abonos.add(new RegistroAbono(fecha, dia, monto, metodo, nota));
            System.out.printf("Abono registrado para %s: S/ %.2f vía %s (%s %s)%n", 
                c.nombre, monto, metodo, dia, fecha);
        }
    }

    public void liquidacionFinDeMes(String mes) {
        System.out.println("==================================================");
        System.out.println("   FUENTE DE SODA CRISS - LIQUIDACIÓN FIN DE MES   ");
        System.out.println("   Mes: " + mes);
        System.out.println("==================================================");
        for (ClienteCuaderno c : clientes.values()) {
            System.out.printf("[%s] %s (%s)%n", c.piso, c.nombre, c.tipoCuenta);
            System.out.printf("  Total Consumos: S/ %.2f | Abonos: S/ %.2f | SALDO: S/ %.2f%n",
                c.getTotalConsumido(), c.getTotalAbonado(), c.getSaldoPendiente());
        }
        System.out.println("==================================================");
    }
}
`,
  },
];
