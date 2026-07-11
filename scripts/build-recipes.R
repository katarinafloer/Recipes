script_arg <- grep("^--file=", commandArgs(FALSE), value = TRUE)
script_path <- if (length(script_arg)) sub("^--file=", "", script_arg[[1]]) else "scripts/build-recipes.R"
project_dir <- normalizePath(file.path(dirname(script_path), ".."), mustWork = TRUE)
recipes_dir <- file.path(project_dir, "recipes")
data_dir <- file.path(project_dir, "data")
output_file <- file.path(data_dir, "site-data.json")

slugify <- function(x) {
  x <- tolower(x)
  x <- gsub("[^a-z0-9]+", "-", x)
  gsub("(^-|-$)", "", x)
}

trim <- function(x) {
  gsub("^\\s+|\\s+$", "", x)
}

json_escape <- function(x) {
  x <- ifelse(is.na(x), "", as.character(x))
  x <- gsub("\\\\", "\\\\\\\\", x)
  x <- gsub('"', '\\"', x)
  x <- gsub("\n", "\\\\n", x, fixed = TRUE)
  x <- gsub("\r", "", x, fixed = TRUE)
  x
}

html_escape <- function(x) {
  x <- ifelse(is.na(x), "", as.character(x))
  x <- gsub("&", "&amp;", x, fixed = TRUE)
  x <- gsub("<", "&lt;", x, fixed = TRUE)
  x <- gsub(">", "&gt;", x, fixed = TRUE)
  x <- gsub('"', "&quot;", x, fixed = TRUE)
  x
}

to_json <- function(x) {
  if (is.null(x)) {
    return("null")
  }

  if (is.data.frame(x)) {
    rows <- lapply(seq_len(nrow(x)), function(i) as.list(x[i, , drop = FALSE]))
    return(to_json(rows))
  }

  if (is.list(x) && is.null(names(x))) {
    return(paste0("[", paste(vapply(x, to_json, character(1)), collapse = ","), "]"))
  }

  if (is.list(x)) {
    entries <- vapply(names(x), function(name) {
      paste0('"', json_escape(name), '":', to_json(x[[name]]))
    }, character(1))
    return(paste0("{", paste(entries, collapse = ","), "}"))
  }

  if (length(x) > 1) {
    return(paste0("[", paste(vapply(as.list(x), to_json, character(1)), collapse = ","), "]"))
  }

  if (is.numeric(x) || is.integer(x)) {
    return(ifelse(is.na(x), "null", as.character(x)))
  }

  if (is.logical(x)) {
    return(ifelse(is.na(x), "null", ifelse(x, "true", "false")))
  }

  paste0('"', json_escape(x), '"')
}

parse_front_matter <- function(lines) {
  if (length(lines) < 3 || lines[[1]] != "---") {
    stop("Recipe is missing YAML-style front matter.")
  }

  end <- which(lines[-1] == "---")[1] + 1
  if (is.na(end)) {
    stop("Recipe front matter is missing a closing --- line.")
  }

  front <- lines[2:(end - 1)]
  body <- paste(lines[(end + 1):length(lines)], collapse = "\n")
  metadata <- list()
  current_key <- NULL

  for (line in front) {
    if (grepl("^\\s*-\\s+", line) && !is.null(current_key)) {
      value <- trim(sub("^\\s*-\\s+", "", line))
      metadata[[current_key]] <- c(metadata[[current_key]], value)
      next
    }

    if (grepl("^[A-Za-z_]+:", line)) {
      parts <- strsplit(line, ":", fixed = TRUE)[[1]]
      key <- trim(parts[[1]])
      value <- trim(paste(parts[-1], collapse = ":"))
      current_key <- key
      metadata[[key]] <- if (nzchar(value)) value else character()
    }
  }

  list(metadata = metadata, body = body)
}

parse_recipe <- function(path) {
  lines <- readLines(path, warn = FALSE)
  parsed <- parse_front_matter(lines)
  metadata <- parsed$metadata
  title <- metadata$title %||% tools::file_path_sans_ext(basename(path))

  list(
    id = slugify(title),
    title = title,
    category = metadata$category %||% "Uncategorized",
    prep_time = metadata$prep_time %||% "",
    servings = metadata$servings %||% "",
    ingredients = as.character(metadata$ingredients %||% character()),
    labels = as.character(metadata$labels %||% metadata$ingredients %||% character()),
    tags = as.character(metadata$tags %||% character()),
    source = metadata$source %||% "",
    file = file.path("recipes", basename(path)),
    page = file.path("recipes", paste0(slugify(title), ".html")),
    body = parsed$body
  )
}

`%||%` <- function(x, y) {
  if (is.null(x) || length(x) == 0 || (length(x) == 1 && !nzchar(x))) y else x
}

read_csv_or_empty <- function(path, columns) {
  if (!file.exists(path)) {
    return(as.data.frame(setNames(replicate(length(columns), character(), simplify = FALSE), columns)))
  }

  data <- read.csv(path, stringsAsFactors = FALSE, na.strings = c(""))
  missing <- setdiff(columns, names(data))
  for (column in missing) {
    data[[column]] <- ""
  }
  data[columns]
}

markdown_to_html <- function(markdown) {
  lines <- strsplit(markdown, "\n", fixed = TRUE)[[1]]
  html <- character()
  in_ol <- FALSE
  in_ul <- FALSE

  close_lists <- function() {
    closing <- character()
    if (in_ol) {
      closing <- c(closing, "</ol>")
      in_ol <<- FALSE
    }
    if (in_ul) {
      closing <- c(closing, "</ul>")
      in_ul <<- FALSE
    }
    closing
  }

  for (line in lines) {
    stripped <- trim(line)

    if (!nzchar(stripped)) {
      next
    }

    if (grepl("^##\\s+", stripped)) {
      html <- c(html, close_lists(), paste0("<h2>", html_escape(sub("^##\\s+", "", stripped)), "</h2>"))
      next
    }

    if (grepl("^#\\s+", stripped)) {
      html <- c(html, close_lists(), paste0("<h1>", html_escape(sub("^#\\s+", "", stripped)), "</h1>"))
      next
    }

    if (grepl("^\\d+\\.\\s+", stripped)) {
      if (!in_ol) {
        html <- c(html, close_lists(), "<ol>")
        in_ol <- TRUE
      }
      html <- c(html, paste0("<li>", html_escape(sub("^\\d+\\.\\s+", "", stripped)), "</li>"))
      next
    }

    if (grepl("^-\\s+", stripped)) {
      if (!in_ul) {
        html <- c(html, close_lists(), "<ul>")
        in_ul <- TRUE
      }
      html <- c(html, paste0("<li>", html_escape(sub("^-\\s+", "", stripped)), "</li>"))
      next
    }

    html <- c(html, close_lists(), paste0("<p>", html_escape(stripped), "</p>"))
  }

  paste(c(html, close_lists()), collapse = "\n")
}

write_recipe_page <- function(recipe) {
  meta <- paste(Filter(nzchar, c(recipe$category, recipe$prep_time, recipe$servings)), collapse = " · ")
  source_link <- if (nzchar(recipe$source)) {
    paste0('<p><a href="', html_escape(recipe$source), '">Source</a></p>')
  } else {
    ""
  }
  ingredients_html <- if (length(recipe$ingredients)) {
    paste0(
      "<h2>Ingredients</h2>\n<ul>\n",
      paste0("<li>", html_escape(recipe$ingredients), "</li>", collapse = "\n"),
      "\n</ul>"
    )
  } else {
    ""
  }

  page <- c(
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1">',
    paste0("    <title>", html_escape(recipe$title), "</title>"),
    '    <link rel="stylesheet" href="../styles.css">',
    "  </head>",
    '  <body class="recipe-page">',
    '    <main class="recipe-page-main">',
    paste0("      <h1>", html_escape(recipe$title), "</h1>"),
    paste0('      <p class="recipe-page-meta">', html_escape(meta), "</p>"),
    source_link,
    ingredients_html,
    markdown_to_html(recipe$body),
    "    </main>",
    "  </body>",
    "</html>"
  )

  writeLines(page, file.path(project_dir, recipe$page))
}

recipe_files <- sort(list.files(recipes_dir, pattern = "\\.md$", full.names = TRUE))
recipes <- lapply(recipe_files, parse_recipe)
invisible(lapply(recipes, write_recipe_page))

pantry <- read_csv_or_empty(
  file.path(data_dir, "pantry.csv"),
  c("item", "category", "quantity", "notes")
)

meal_log <- read_csv_or_empty(
  file.path(data_dir, "meal_log.csv"),
  c("date", "recipe", "review")
)

site_data <- list(
  generated_at = format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z"),
  recipes = recipes,
  pantry = pantry,
  meal_log = meal_log
)

dir.create(data_dir, showWarnings = FALSE, recursive = TRUE)
writeLines(to_json(site_data), output_file)
message("Wrote ", output_file)
