package com.github.claudecodegui.mcp.marketplace;

import org.junit.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.Assert.assertEquals;

/**
 * The built-in presets start with the command each server's own README gives.
 */
public class BuiltInMcpMarketplaceClientTest {

    private static Map<String, McpInstallOption> optionsByName() {
        McpMarketplaceSource source = McpMarketplaceSource.defaults().get(0);
        List<McpMarketplaceEntry> entries = new BuiltInMcpMarketplaceClient().loadEntries(source);
        return entries.stream().collect(Collectors.toMap(McpMarketplaceEntry::getName, e -> e.getInstallOptions().get(0)));
    }

    @Test
    public void pythonServersRunWithUvx() {
        // On npm, "mcp-server-fetch" is a security holding package and
        // "@modelcontextprotocol/server-time" does not exist.
        Map<String, McpInstallOption> options = optionsByName();
        assertEquals("uvx", options.get("fetch").getCommand());
        assertEquals(Arrays.asList("mcp-server-fetch"), options.get("fetch").getArgs());
        assertEquals("uvx", options.get("time").getCommand());
        assertEquals(Arrays.asList("mcp-server-time"), options.get("time").getArgs());
    }

    @Test
    public void nodeServersRunWithNpx() {
        Map<String, McpInstallOption> options = optionsByName();
        assertEquals("npx", options.get("memory").getCommand());
        assertEquals(Arrays.asList("-y", "@modelcontextprotocol/server-memory"), options.get("memory").getArgs());
        assertEquals(Arrays.asList("-y", "@upstash/context7-mcp"), options.get("context7").getArgs());
    }
}
