CREATE TABLE `drawings` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `short_id` varchar(200) NOT NULL,
  `parent` int(11) unsigned,
  `settings` longtext,
  `date` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00' ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`, `short_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;