CREATE TABLE `draws` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `short_id` varchar(200) NOT NULL,
  `date` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00' ON UPDATE CURRENT_TIMESTAMP,
  `parent` int(11) unsigned,
  PRIMARY KEY (`id`, `short_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;